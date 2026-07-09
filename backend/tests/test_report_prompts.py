from app.services.ai.report_prompts import ReportPromptSource, build_report_prompt


def test_counseling_note_prompt_requires_structured_json_and_safe_sections() -> None:
    prompt = build_report_prompt(
        report_type="counseling_note",
        title="陈雨 第6次咨询记录",
        sources=[
            ReportPromptSource(
                resource_type="transcript",
                resource_id="transcript-1",
                label="第6次转写",
                content="咨询师：这一周睡眠怎么样？\n来访者：还是担心工作评价。",
            )
        ],
    )

    assert prompt.version == "report-prompts-v1"
    assert "不编造未出现的人名、日期、诊断、风险或干预" in prompt.system_prompt
    assert "输出必须是 JSON 对象" in prompt.system_prompt
    assert [section.title for section in prompt.sections] == [
        "基本信息",
        "本次主题",
        "咨询过程",
        "评估与风险",
        "后续计划",
    ]
    assert "第6次转写" in prompt.user_prompt
    assert "工作评价" in prompt.user_prompt


def test_case_report_prompt_uses_case_conceptualization_sections() -> None:
    prompt = build_report_prompt(
        report_type="case_report",
        title="陈雨 个案报告",
        sources=[
            ReportPromptSource(
                resource_type="profile",
                resource_id="profile-1",
                label="陈雨 基础档案",
                content="主诉：焦虑与睡眠问题。危机评估：轻度。",
            )
        ],
    )

    assert "个案报告" in prompt.user_prompt
    assert [section.title for section in prompt.sections] == [
        "基本资料",
        "问题概述",
        "案例概念化",
        "咨询过程",
        "风险评估",
        "评估与计划",
    ]
    assert "避免确定性诊断" in prompt.user_prompt
