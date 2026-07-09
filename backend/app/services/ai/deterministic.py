from app.services.ai.base import RecordingAIResult, RecordingSummaryResult
from app.services.ai.report_prompts import ReportPrompt, get_report_prompt_spec


class DeterministicAIProvider:
    def process_recording(
        self,
        *,
        title: str,
        duration_seconds: int,
        audio_bytes: bytes | None = None,
        audio_url: str | None = None,
        mime_type: str = "audio/mp4",
    ) -> RecordingAIResult:
        duration_ms = max(duration_seconds, 60) * 1000
        segment_span = duration_ms // 3
        return RecordingAIResult(
            speakers={"speaker_1": "咨询师", "speaker_2": "来访者"},
            segments=[
                {
                    "start_ms": 0,
                    "end_ms": segment_span,
                    "speaker_key": "speaker_1",
                    "text": "我们先回顾这一周最需要关注的变化。",
                },
                {
                    "start_ms": segment_span,
                    "end_ms": segment_span * 2,
                    "speaker_key": "speaker_2",
                    "text": "近期睡眠和工作评价带来的焦虑比较明显。",
                },
                {
                    "start_ms": segment_span * 2,
                    "end_ms": duration_ms,
                    "speaker_key": "speaker_1",
                    "text": "本次梳理了触发事件、自动化想法和下一步练习。",
                },
            ],
            summary=f"{title}围绕近期压力、情绪反应和应对方式展开，形成了清晰的后续跟进方向。",
            chapters=[
                {
                    "title": "近况回顾",
                    "summary": "回顾近期睡眠、工作和关系变化。",
                    "start_ms": 0,
                    "end_ms": segment_span,
                },
                {
                    "title": "核心议题",
                    "summary": "识别压力触发、想法和情绪之间的联系。",
                    "start_ms": segment_span,
                    "end_ms": segment_span * 2,
                },
                {
                    "title": "后续计划",
                    "summary": "确定记录练习和下次复核重点。",
                    "start_ms": segment_span * 2,
                    "end_ms": duration_ms,
                },
            ],
        )

    def summarize_transcript(
        self,
        *,
        title: str,
        duration_seconds: int,
        transcript: str,
    ) -> RecordingSummaryResult:
        duration_ms = max(duration_seconds, 1) * 1000
        preview = transcript.strip().replace("\n", " ")[:80]
        return RecordingSummaryResult(
            summary=f"{title}基于当前转写重新整理：{preview}",
            chapters=[{
                "title": "录音内容",
                "summary": preview,
                "start_ms": 0,
                "end_ms": duration_ms,
            }],
        )

    def generate_report(
        self,
        *,
        report_type: str,
        title: str,
        source_labels: list[str],
        prompt: ReportPrompt | None = None,
    ) -> dict[str, object]:
        source_text = "、".join(source_labels) if source_labels else "用户本次输入"
        sections = prompt.sections if prompt else get_report_prompt_spec(report_type).sections
        return {
            "blocks": [
                {
                    "title": section.title,
                    "content": (
                        f"{section.title}基于已选择资料（{source_text}）生成。"
                        f"写作要求：{section.instruction} 请咨询师结合实际情况校订。"
                    ),
                }
                for section in sections
            ],
            "generated_by": "deterministic-development-provider",
            "prompt_version": prompt.version if prompt else None,
            "prompt_system": prompt.system_prompt if prompt else None,
            "prompt_user": prompt.user_prompt if prompt else None,
            "title": title,
        }

    def supervision_reply(
        self,
        *,
        question: str,
        context_labels: list[str],
    ) -> str:
        context = "、".join(context_labels) if context_labels else "未引用档案资料"
        return (
            f"基于{context}，建议把督导问题分成三层：先澄清可观察事实，"
            "再识别咨询师自身反应，最后明确风险评估与下一步可验证的工作假设。"
            f"当前问题是：{question}"
        )
