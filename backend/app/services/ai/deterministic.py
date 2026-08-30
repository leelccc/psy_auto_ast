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
        source_text = "、".join(source_labels) if source_labels else "本次所选资料"
        sections = prompt.sections if prompt else get_report_prompt_spec(report_type).sections
        blocks = [
            {
                "title": section.title,
                "content": self._draft_section(section.title, source_text),
            }
            for section in sections
        ]
        return {
            "blocks": blocks,
            "title": title,
            "generated_by": "deterministic-development-provider",
            "prompt_version": prompt.version if prompt else None,
            "prompt_system": prompt.system_prompt if prompt else None,
            "prompt_user": prompt.user_prompt if prompt else None,
        }

    @staticmethod
    def _draft_section(section_title: str, source_text: str) -> str:
        """生成可读、可校订的草稿段落，而非回显写作要求。

        采用「标准结构标题 + 一句专业引导 + 明确待补全提示」的形式，
        让咨询师拿到的是能直接往下填的骨架，而不是一堆指令文字。
        """
        hints = {
            "基本信息": (
                "来访者基础信息、咨询次数、时间与形式以系统记录为准；"
                f"本次资料来源：{source_text}。请核对姓名/编号、日期与咨询形式是否准确。"
            ),
            "本次主题": (
                f"依据所选资料（{source_text}），请提炼 1–3 个核心议题，"
                "并注明来访者主诉的变化与本次咨询目标。"
            ),
            "咨询过程": (
                "请按事实顺序记录关键互动：咨询师使用了哪些干预、来访者如何回应、"
                "出现了哪些重要表述。避免小说化描写，只写可观察内容。"
            ),
            "评估与风险": (
                "结合资料描述情绪与功能状态、风险线索与保护因素；"
                "若资料不足以判断，请明确写「资料未提供，需进一步评估」，不要下未经验证的诊断。"
            ),
            "后续计划": (
                "列出可执行的跟进重点与家庭作业，以及下次咨询的关注点；"
                "如需要转介或会诊，请在此注明。"
            ),
            "督导重点": "请概括本次受督最核心的问题、材料范围与需要回应的困惑。",
            "受督内容": "请整理本次提交的案例、问题与困惑，并列出材料来源。",
            "案例理解": (
                "整合来访者议题、关系模式与风险线索，形成「待验证」的工作假设，"
                "并注明支持证据。"
            ),
            "咨询师工作观察": "记录咨询师已做到的有效部分、可能的卡点与反移情/个人反应线索。",
            "能力观察": "整理咨询师在概念化、关系处理、风险评估、技术选择上的学习点。",
            "工作建议": "给出具体、温和、可执行的下一步干预建议或会谈内可尝试的回应方向。",
            "行动计划": "列出后续咨询、资料整理或下次督导前的具体行动项。",
            "督导反馈要点": "概括督导师给出的理解、反馈、提醒与建议。",
            "基本资料": (
                "来访者编号、性别、咨询次数、时间跨度与资料来源以系统记录为准；"
                f"本次资料来源：{source_text}。缺失项请补全。"
            ),
            "问题概述": "整合主要困扰、功能影响与重要生活事件，区分「事实」与「推断」。",
            "案例概念化": (
                "提出有资料支持的工作假设，说明触发与维持因素、资源与关系模式；"
                "避免确定性诊断。"
            ),
            "咨询过程": "按阶段总结咨询目标、主要干预、来访者变化与关键节点。",
            "风险评估": "仅基于资料列出风险线索、保护因素与需继续评估的内容。",
            "评估与计划": "总结当前进展、后续目标、建议频率、转介/会诊或其他专业建议。",
        }
        return hints.get(
            section_title,
            f"请依据所选资料（{source_text}）补充本部分内容，并保持专业、克制的表述。",
        )

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
