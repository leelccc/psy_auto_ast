import base64
import json
import time
from typing import Any

import httpx

from app.services.ai.base import RecordingAIResult, RecordingSummaryResult


MAX_BASE64_AUDIO_BYTES = 10 * 1024 * 1024
MAX_SYNC_AUDIO_SECONDS = 5 * 60


class BailianAIError(RuntimeError):
    pass


class BailianRecordingAIProvider:
    def __init__(
        self,
        *,
        api_key: str,
        asr_model: str,
        summary_model: str,
        local_asr_model: str | None = None,
        base_url: str = "https://dashscope.aliyuncs.com",
        llm_api_key: str | None = None,
        llm_base_url: str | None = None,
        timeout_seconds: float = 120,
        transport: httpx.BaseTransport | None = None,
        poll_interval_seconds: float = 1,
        max_poll_attempts: int = 120,
    ) -> None:
        if not api_key.strip():
            raise ValueError("百炼 API Key 未配置。")
        self.api_key = api_key
        self.asr_model = asr_model
        self.local_asr_model = local_asr_model or asr_model
        self.summary_model = summary_model
        self.base_url = base_url.rstrip("/")
        self.llm_api_key = (llm_api_key or api_key).strip()
        self.llm_base_url = (llm_base_url or f"{self.base_url}/compatible-mode/v1").rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.transport = transport
        self.poll_interval_seconds = poll_interval_seconds
        self.max_poll_attempts = max_poll_attempts

    def process_recording(
        self,
        *,
        title: str,
        duration_seconds: int,
        audio_bytes: bytes | None = None,
        audio_url: str | None = None,
        mime_type: str = "audio/mp4",
    ) -> RecordingAIResult:
        if bool(audio_bytes) == bool(audio_url):
            raise ValueError("必须且只能提供音频字节或音频 URL。")
        if audio_bytes is not None and duration_seconds > MAX_SYNC_AUDIO_SECONDS:
            raise ValueError("当前同步语音识别单次最多支持 5 分钟录音。")
        if audio_bytes is not None and len(audio_bytes) > MAX_BASE64_AUDIO_BYTES:
            raise ValueError("当前 Base64 语音识别单文件不能超过 10MB。")

        audio = audio_url or (
            f"data:{mime_type};base64,{base64.b64encode(audio_bytes or b'').decode('ascii')}"
        )
        if audio_url:
            transcript, speakers, segments = self._transcribe_url(audio_url, duration_seconds)
        else:
            transcript = self._transcribe_base64(audio)
            speakers = {"speaker_1": "发言人"}
            segments = [{
                "start_ms": 0,
                "end_ms": max(duration_seconds, 1) * 1000,
                "speaker_key": "speaker_1",
                "text": transcript,
            }]
        summary_payload = self._summarize(
            title=title,
            transcript=transcript,
            duration_seconds=duration_seconds,
        )
        return RecordingAIResult(
            speakers=speakers,
            segments=segments,
            summary=summary_payload["main_summary"],
            chapters=summary_payload["chapters"],
        )

    def summarize_transcript(
        self,
        *,
        title: str,
        duration_seconds: int,
        transcript: str,
    ) -> RecordingSummaryResult:
        if not transcript.strip():
            raise ValueError("转写内容为空，无法生成录音纪要。")
        summary_payload = self._summarize(
            title=title,
            transcript=transcript,
            duration_seconds=duration_seconds,
        )
        return RecordingSummaryResult(
            summary=summary_payload["main_summary"],
            chapters=summary_payload["chapters"],
        )

    def _transcribe_base64(self, audio: str) -> str:
        response = self._post(
            "/api/v1/services/aigc/multimodal-generation/generation",
            {
                "model": self.local_asr_model,
                "input": {
                    "messages": [{
                        "role": "user",
                        "content": [{"audio": audio}],
                    }]
                },
                "parameters": {"result_format": "message"},
            },
        )
        try:
            content = response["output"]["choices"][0]["message"]["content"]
            if isinstance(content, str):
                transcript = content
            else:
                transcript = next(
                    item["text"] for item in content
                    if isinstance(item, dict) and item.get("text")
                )
        except (KeyError, IndexError, StopIteration, TypeError) as error:
            raise BailianAIError("百炼语音识别返回格式不正确。") from error
        transcript = str(transcript).strip()
        if not transcript:
            raise BailianAIError("百炼语音识别未返回文字。")
        return transcript

    def _transcribe_url(
        self,
        audio_url: str,
        duration_seconds: int,
    ) -> tuple[str, dict[str, str], list[dict[str, object]]]:
        created = self._post(
            "/api/v1/services/audio/asr/transcription",
            {
                "model": self.asr_model,
                "input": {"file_urls": [audio_url]},
                "parameters": {
                    "language_hints": ["zh", "en"],
                    "diarization_enabled": True,
                },
            },
            extra_headers={"X-DashScope-Async": "enable"},
        )
        try:
            task_id = str(created["output"]["task_id"])
        except (KeyError, TypeError) as error:
            raise BailianAIError("百炼语音识别任务创建失败。") from error

        task = None
        for _ in range(self.max_poll_attempts):
            task = self._get(f"/api/v1/tasks/{task_id}")
            status = str(task.get("output", {}).get("task_status", ""))
            if status == "SUCCEEDED":
                break
            if status in {"FAILED", "CANCELED", "UNKNOWN"}:
                raise BailianAIError(f"百炼语音识别任务失败：{status}")
            time.sleep(self.poll_interval_seconds)
        else:
            raise BailianAIError("百炼语音识别任务等待超时。")

        try:
            results = task["output"]["results"]
            successful = next(
                item for item in results if item.get("subtask_status") == "SUCCEEDED"
            )
            result_url = str(successful["transcription_url"])
        except (KeyError, StopIteration, TypeError) as error:
            raise BailianAIError("百炼语音识别任务未返回有效结果。") from error
        return self._parse_file_transcription(self._get(result_url), duration_seconds)

    @staticmethod
    def _parse_file_transcription(
        payload: dict[str, Any],
        duration_seconds: int,
    ) -> tuple[str, dict[str, str], list[dict[str, object]]]:
        transcripts = payload.get("transcripts")
        if not isinstance(transcripts, list) or not transcripts:
            raise BailianAIError("百炼语音识别结果缺少转写文本。")
        text_parts: list[str] = []
        segments: list[dict[str, object]] = []
        speakers: dict[str, str] = {}
        for transcript in transcripts:
            if not isinstance(transcript, dict):
                continue
            transcript_text = str(transcript.get("text", "")).strip()
            if transcript_text:
                text_parts.append(transcript_text)
            sentences = transcript.get("sentences", [])
            if not isinstance(sentences, list):
                continue
            for sentence in sentences:
                if not isinstance(sentence, dict):
                    continue
                text = str(sentence.get("text", "")).strip()
                if not text:
                    continue
                raw_speaker = sentence.get("speaker_id", 1)
                speaker_key = f"speaker_{raw_speaker}"
                speakers.setdefault(speaker_key, f"发言人 {raw_speaker}")
                segments.append({
                    "start_ms": max(0, int(sentence.get("begin_time", 0))),
                    "end_ms": max(0, int(sentence.get("end_time", 0))),
                    "speaker_key": speaker_key,
                    "text": text,
                })
        full_text = "\n".join(text_parts).strip()
        if not full_text:
            full_text = "\n".join(str(item["text"]) for item in segments).strip()
        if not full_text:
            raise BailianAIError("百炼语音识别未返回文字。")
        if not segments:
            speakers = {"speaker_1": "发言人"}
            segments = [{
                "start_ms": 0,
                "end_ms": max(duration_seconds, 1) * 1000,
                "speaker_key": "speaker_1",
                "text": full_text,
            }]
        return full_text, speakers, segments

    def _summarize(
        self,
        *,
        title: str,
        transcript: str,
        duration_seconds: int,
    ) -> dict[str, Any]:
        response = self._post(
            "/chat/completions",
            {
                "model": self.summary_model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "你是心理咨询记录助手。只依据转写文本整理录音纪要，不推断诊断，"
                            "不编造事实。返回 JSON：main_summary 为简洁完整纪要；chapters 为数组，"
                            "每项包含 title、summary、start_ms、end_ms。"
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"录音标题：{title}\n录音时长：{duration_seconds} 秒\n"
                            f"转写文本：\n{transcript}"
                        ),
                    },
                ],
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
            base_url=self.llm_base_url,
            api_key=self.llm_api_key,
        )
        try:
            content = response["choices"][0]["message"]["content"]
            payload = json.loads(self._strip_json_fence(str(content)))
            main_summary = str(payload["main_summary"]).strip()
            chapters = payload.get("chapters", [])
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
            raise BailianAIError("百炼录音纪要返回格式不正确。") from error
        if not main_summary or not isinstance(chapters, list):
            raise BailianAIError("百炼录音纪要缺少必要内容。")
        return {
            "main_summary": main_summary,
            "chapters": [
                self._normalize_chapter(item, duration_seconds)
                for item in chapters
                if isinstance(item, dict)
            ],
        }

    def _post(
        self,
        path: str,
        payload: dict[str, Any],
        *,
        extra_headers: dict[str, str] | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {api_key or self.api_key}",
            "Content-Type": "application/json",
            **(extra_headers or {}),
        }
        return self._request("POST", path, headers=headers, json_payload=payload, base_url=base_url)

    def _get(self, path: str) -> dict[str, Any]:
        return self._request(
            "GET",
            path,
            headers={"Authorization": f"Bearer {self.api_key}"},
        )

    def _request(
        self,
        method: str,
        path: str,
        *,
        headers: dict[str, str],
        json_payload: dict[str, Any] | None = None,
        base_url: str | None = None,
    ) -> dict[str, Any]:
        try:
            with httpx.Client(
                base_url=base_url or self.base_url,
                timeout=self.timeout_seconds,
                transport=self.transport,
            ) as client:
                response = client.request(
                    method,
                    path,
                    headers=headers,
                    json=json_payload,
                )
                response.raise_for_status()
                value = response.json()
        except (httpx.HTTPError, json.JSONDecodeError) as error:
            raise BailianAIError(f"百炼模型调用失败：{error}") from error
        if not isinstance(value, dict):
            raise BailianAIError("百炼模型返回格式不正确。")
        return value

    @staticmethod
    def _strip_json_fence(value: str) -> str:
        stripped = value.strip()
        if stripped.startswith("```"):
            stripped = stripped.split("\n", 1)[-1]
            stripped = stripped.rsplit("```", 1)[0]
        return stripped.strip()

    @staticmethod
    def _normalize_chapter(item: dict[str, Any], duration_seconds: int) -> dict[str, object]:
        duration_ms = max(duration_seconds, 1) * 1000
        start_ms = max(0, int(item.get("start_ms", 0)))
        end_ms = min(duration_ms, max(start_ms, int(item.get("end_ms", duration_ms))))
        return {
            "title": str(item.get("title", "录音内容")).strip() or "录音内容",
            "summary": str(item.get("summary", "")).strip(),
            "start_ms": start_ms,
            "end_ms": end_ms,
        }
