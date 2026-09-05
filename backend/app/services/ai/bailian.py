import base64
import json
import time
from typing import Any

import httpx

from app.services.ai.base import RecordingAIResult, RecordingSummaryResult


MAX_BASE64_AUDIO_BYTES = 10 * 1024 * 1024
MAX_SYNC_AUDIO_SECONDS = 5 * 60
MAX_AUDIO_SECONDS = 2 * 60 * 60  # 产品上限：录音转写最多支持 2 小时


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
        report_model: str | None = None,
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
        self.report_model = report_model or summary_model
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
        if duration_seconds > MAX_AUDIO_SECONDS:
            raise ValueError("录音时长超过 2 小时，当前暂不支持转写。")

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

    def generate_report(
        self,
        *,
        report_type: str,
        title: str,
        source_labels: list[str],
        prompt: object | None = None,
    ) -> dict[str, object]:
        """基于已选资料，用 LLM 生成结构化的报告草稿（blocks）。"""
        system_prompt = (
            "你是心理咨询专业文档写作助手，协助咨询师把已选资料整理为专业、克制、可校订的草稿。"
            "只依据用户提供的资料生成，不编造未出现的人名、日期、诊断、风险或干预。"
            "涉及风险时，必须用「资料显示/资料未提供/需要进一步评估」的措辞。"
            "输出必须是 JSON 对象，格式为 "
            '{"blocks":[{"title":"段落标题","content":"段落内容"}],"title":"报告标题"}。'
            "blocks 的标题必须严格使用用户指定段落标题；内容使用专业中文，避免夸大疗效与确定性诊断。"
        )
        user_prompt = (
            f"报告标题：{title}\n报告类型：{report_type}\n"
            f"已选资料：{('、'.join(source_labels) if source_labels else '未选择资料')}\n\n"
            "请生成以下段落（使用用户给出的段落标题作为 block.title）：\n"
        )
        if prompt is not None:
            prompt_system = getattr(prompt, "system_prompt", None)
            prompt_user = getattr(prompt, "user_prompt", None)
            if prompt_system:
                system_prompt = str(prompt_system)
            if prompt_user:
                user_prompt = str(prompt_user)
        response = self._post(
            "/chat/completions",
            {
                "model": self.report_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.3,
                "response_format": {"type": "json_object"},
            },
            base_url=self.llm_base_url,
            api_key=self.llm_api_key,
        )
        try:
            content = response["choices"][0]["message"]["content"]
            payload = json.loads(self._strip_json_fence(str(content)))
            raw_blocks = payload.get("blocks", [])
            if not isinstance(raw_blocks, list) or not raw_blocks:
                raise BailianAIError("百炼报告生成未返回有效段落。")
            blocks: list[dict[str, object]] = []
            for item in raw_blocks:
                if not isinstance(item, dict):
                    continue
                block_title = str(item.get("title", "")).strip()
                block_content = str(item.get("content", "")).strip()
                if not block_title or not block_content:
                    continue
                blocks.append({"title": block_title, "content": block_content})
            if not blocks:
                raise BailianAIError("百炼报告生成段落内容为空。")
            return {
                "blocks": blocks,
                "title": str(payload.get("title", title)).strip() or title,
                "generated_by": "bailian",
                "prompt_version": getattr(prompt, "version", None),
            }
        except (KeyError, IndexError, TypeError, json.JSONDecodeError, BailianAIError) as error:
            raise BailianAIError(f"百炼报告生成返回格式不正确：{error}") from error

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
                output = task.get("output", {})
                detail = str(output.get("message") or output.get("code") or status)
                if detail == "ASR_RESPONSE_HAVE_NO_WORDS":
                    detail = "录音中未识别到有效语音，请确认麦克风输入后重新录制"
                raise BailianAIError(f"百炼语音识别任务失败：{detail}")
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
                            "每项包含 title、summary、start_ms、end_ms。\n"
                            "章节划分要求（必须遵守）：\n"
                            "1. 按话题或议题的切换分章，不要把每一句、每一次简短对话单独成章；\n"
                            "2. 单个章节时长不得短于 60 秒，过短的相邻内容必须并入同一章节；\n"
                            "3. 章节总数控制在 3 到 8 个，按录音时长自适应："
                            "5 分钟以内约 3 个，10–30 分钟 4–6 个，30 分钟以上不超过 8 个；\n"
                            "4. 各章节的 start_ms 与 end_ms 必须首尾相接、连续覆盖整段录音，"
                            "第一个 start_ms 为 0，最后一个 end_ms 为录音总时长。"
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
        normalized = [
            self._normalize_chapter(item, duration_seconds)
            for item in chapters
            if isinstance(item, dict)
        ]
        return {
            "main_summary": main_summary,
            "chapters": self.merge_short_chapters(normalized, duration_seconds),
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

    @staticmethod
    def merge_short_chapters(
        chapters: list[dict[str, object]],
        duration_seconds: int,
        min_chapter_ms: int = 30_000,
        max_chapters: int = 8,
    ) -> list[dict[str, object]]:
        """兜底合并碎片章节，避免章节速览出现「几秒一章」。

        即使 prompt 已约束，模型偶尔仍会产出过短或过多的章节。
        这里先把短于阈值的章节并入相邻章节，再把总数压到上限以内，
        最后保证首尾覆盖整段录音。
        """
        duration_ms = max(duration_seconds, 1) * 1000
        items: list[dict[str, object]] = [
            dict(chapter) for chapter in chapters if isinstance(chapter, dict)
        ]
        items.sort(key=lambda item: int(item.get("start_ms", 0)))
        if not items:
            return []

        def span(chapter: dict[str, object]) -> int:
            return max(0, int(chapter.get("end_ms", 0)) - int(chapter.get("start_ms", 0)))

        def merge_into(base: dict[str, object], extra: dict[str, object]) -> dict[str, object]:
            return {
                "title": str(base.get("title") or "录音内容"),
                "summary": " ".join(
                    part
                    for part in (
                        str(base.get("summary") or "").strip(),
                        str(extra.get("summary") or "").strip(),
                    )
                    if part
                ).strip(),
                "start_ms": min(int(base.get("start_ms", 0)), int(extra.get("start_ms", 0))),
                "end_ms": max(int(base.get("end_ms", 0)), int(extra.get("end_ms", 0))),
            }

        merged: list[dict[str, object]] = []
        for chapter in items:
            if merged and span(chapter) < min_chapter_ms:
                merged[-1] = merge_into(merged[-1], chapter)
            else:
                merged.append(chapter)
        if len(merged) > 1 and span(merged[0]) < min_chapter_ms:
            merged[0] = merge_into(merged[0], merged[1])
            merged.pop(1)

        while len(merged) > max_chapters:
            shortest_index = min(
                range(len(merged) - 1),
                key=lambda index: span(merged[index]) + span(merged[index + 1]),
            )
            merged[shortest_index] = merge_into(
                merged[shortest_index], merged[shortest_index + 1]
            )
            merged.pop(shortest_index + 1)

        merged[0]["start_ms"] = 0
        merged[-1]["end_ms"] = duration_ms
        return merged
