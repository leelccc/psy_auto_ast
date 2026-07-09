import json

import httpx

from app.services.ai.bailian import BailianRecordingAIProvider


def test_bailian_provider_transcribes_base64_audio_then_summarizes_transcript() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/multimodal-generation/generation"):
            return httpx.Response(
                200,
                json={
                    "output": {
                        "choices": [{
                            "message": {
                                "content": [{"text": "咨询师询问近况，来访者谈到睡眠焦虑。"}]
                            }
                        }]
                    }
                },
            )
        return httpx.Response(
            200,
            json={
                "choices": [{
                    "message": {
                        "content": json.dumps({
                            "main_summary": "本次围绕睡眠焦虑进行了评估与讨论。",
                            "chapters": [{
                                "title": "近况与睡眠",
                                "summary": "讨论近期睡眠焦虑。",
                                "start_ms": 0,
                                "end_ms": 120000,
                            }],
                        }, ensure_ascii=False)
                    }
                }]
            },
        )

    provider = BailianRecordingAIProvider(
        api_key="test-key",
        asr_model="qwen3-asr-flash",
        summary_model="qwen-plus",
        transport=httpx.MockTransport(handler),
    )

    result = provider.process_recording(
        title="第七次咨询",
        duration_seconds=120,
        audio_bytes=b"fake-m4a-bytes",
        mime_type="audio/mp4",
    )

    asr_body = json.loads(requests[0].content)
    audio_value = asr_body["input"]["messages"][0]["content"][0]["audio"]
    summary_body = json.loads(requests[1].content)
    assert audio_value.startswith("data:audio/mp4;base64,")
    assert "咨询师询问近况，来访者谈到睡眠焦虑。" in json.dumps(
        summary_body,
        ensure_ascii=False,
    )
    assert result.segments[0]["text"] == "咨询师询问近况，来访者谈到睡眠焦虑。"
    assert result.summary == "本次围绕睡眠焦虑进行了评估与讨论。"
    assert result.chapters[0]["end_ms"] == 120000


def test_bailian_provider_can_send_a_presigned_minio_url() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/services/audio/asr/transcription"):
            return httpx.Response(
                200,
                json={"output": {"task_id": "task-1"}},
            )
        if request.url.path.endswith("/tasks/task-1"):
            return httpx.Response(
                200,
                json={
                    "output": {
                        "task_status": "SUCCEEDED",
                        "results": [{
                            "subtask_status": "SUCCEEDED",
                            "transcription_url": "https://result.test/transcription.json",
                        }],
                    }
                },
            )
        if request.url.host == "result.test":
            return httpx.Response(
                200,
                json={
                    "transcripts": [{
                        "text": "通过链接识别的文本。",
                        "sentences": [{
                            "begin_time": 0,
                            "end_time": 2400,
                            "text": "通过链接识别的文本。",
                            "speaker_id": 1,
                        }],
                    }]
                },
            )
        return httpx.Response(
            200,
            json={
                "choices": [{
                    "message": {
                        "content": json.dumps({
                            "main_summary": "链接录音纪要。",
                            "chapters": [],
                        }, ensure_ascii=False)
                    }
                }]
            },
        )

    provider = BailianRecordingAIProvider(
        api_key="test-key",
        asr_model="fun-asr",
        local_asr_model="qwen3-asr-flash",
        summary_model="qwen-plus",
        transport=httpx.MockTransport(handler),
        poll_interval_seconds=0,
    )
    result = provider.process_recording(
        title="链接录音",
        duration_seconds=60,
        audio_url="https://minio.example.test/private/audio.m4a?signature=short-lived",
        mime_type="audio/mp4",
    )

    asr_body = json.loads(requests[0].content)
    assert asr_body["input"]["file_urls"][0].startswith(
        "https://minio.example.test/private/audio.m4a"
    )
    assert result.segments[0]["speaker_key"] == "speaker_1"
    assert result.segments[0]["end_ms"] == 2400


def test_bailian_provider_rejects_base64_audio_over_model_limit() -> None:
    provider = BailianRecordingAIProvider(
        api_key="test-key",
        asr_model="qwen3-asr-flash",
        summary_model="qwen-plus",
        transport=httpx.MockTransport(
            lambda _: httpx.Response(500, json={"message": "must not be called"})
        ),
    )

    try:
        provider.process_recording(
            title="超限录音",
            duration_seconds=60,
            audio_bytes=b"x" * (10 * 1024 * 1024 + 1),
            mime_type="audio/mp4",
        )
    except ValueError as error:
        assert "10MB" in str(error)
    else:
        raise AssertionError("oversized audio should be rejected")


def test_bailian_provider_can_summarize_existing_transcript_without_asr() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "choices": [{
                    "message": {
                        "content": json.dumps({
                            "main_summary": "修订后的录音纪要。",
                            "chapters": [],
                        }, ensure_ascii=False)
                    }
                }]
            },
        )

    provider = BailianRecordingAIProvider(
        api_key="test-key",
        asr_model="fun-asr",
        local_asr_model="qwen3-asr-flash",
        summary_model="qwen-plus",
        transport=httpx.MockTransport(handler),
    )

    result = provider.summarize_transcript(
        title="修订录音",
        duration_seconds=60,
        transcript="人工校对后的完整转写。",
    )

    assert len(requests) == 1
    assert requests[0].url.path.endswith("/chat/completions")
    assert result.summary == "修订后的录音纪要。"
