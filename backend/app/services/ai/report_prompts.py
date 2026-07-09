from dataclasses import dataclass


@dataclass(frozen=True)
class ReportSectionSpec:
    title: str
    instruction: str


@dataclass(frozen=True)
class ReportPromptSource:
    resource_type: str
    resource_id: str
    label: str
    content: str


@dataclass(frozen=True)
class ReportPromptSpec:
    report_type: str
    display_name: str
    role: str
    objective: str
    sections: tuple[ReportSectionSpec, ...]


@dataclass(frozen=True)
class ReportPrompt:
    version: str
    report_type: str
    title: str
    system_prompt: str
    user_prompt: str
    sections: tuple[ReportSectionSpec, ...]
    sources: tuple[ReportPromptSource, ...]


PROMPT_VERSION = "report-prompts-v1"
MAX_SOURCE_CHARS = 2400
MAX_TOTAL_SOURCE_CHARS = 14000


REPORT_PROMPT_SPECS: dict[str, ReportPromptSpec] = {
    "counseling_note": ReportPromptSpec(
        report_type="counseling_note",
        display_name="咨询记录",
        role="你是心理咨询记录整理助手，协助咨询师把已选资料整理为专业、克制、可校订的咨询记录。",
        objective="生成某一次咨询的记录草稿，服务于咨询师复盘、后续计划和必要的专业留痕。",
        sections=(
            ReportSectionSpec("基本信息", "整理来访者、次数、时间、形式、资料来源等已知信息。缺失时写“资料未提供”。"),
            ReportSectionSpec("本次主题", "概括本次主要议题、来访者主诉变化、重要情境和咨询目标。"),
            ReportSectionSpec("咨询过程", "按事实描述关键互动、干预方向、来访者反应和重要表述，不写小说化细节。"),
            ReportSectionSpec("评估与风险", "基于资料描述情绪、功能、风险线索和保护因素；不得给出未经资料支持的诊断。"),
            ReportSectionSpec("后续计划", "列出可执行的跟进重点、作业或下次咨询关注点。"),
        ),
    ),
    "supervision_feedback": ReportPromptSpec(
        report_type="supervision_feedback",
        display_name="督导反馈",
        role="你是心理咨询督导反馈整理助手，帮助督导师形成清晰、支持性且可执行的反馈草稿。",
        objective="基于受督资料生成督导反馈，聚焦案例理解、咨询师工作和下一步专业成长。",
        sections=(
            ReportSectionSpec("督导重点", "概括本次受督最核心的问题、材料范围和需要回应的困惑。"),
            ReportSectionSpec("案例理解", "整理来访者议题、关系模式、风险线索和可能的工作假设；明确哪些只是待验证假设。"),
            ReportSectionSpec("咨询师工作观察", "描述咨询师已有工作、有效部分、可能卡点和反移情/个人反应线索。"),
            ReportSectionSpec("工作建议", "给出具体、温和、可执行的干预建议和会谈内可尝试的回应方向。"),
            ReportSectionSpec("后续计划", "整理下次督导/咨询前建议追踪的事项。"),
        ),
    ),
    "supervision_note": ReportPromptSpec(
        report_type="supervision_note",
        display_name="督导记录",
        role="你是督导过程记录助手，帮助受督者整理督导记录，突出学习、反馈和后续行动。",
        objective="生成一次督导记录草稿，用于受督者复盘督导内容和后续执行。",
        sections=(
            ReportSectionSpec("受督内容", "整理本次提交的案例、问题、困惑和材料来源。"),
            ReportSectionSpec("督导反馈要点", "概括督导师给出的理解、反馈、提醒和建议。"),
            ReportSectionSpec("能力观察", "整理咨询师在概念化、关系处理、风险评估、技术选择上的学习点。"),
            ReportSectionSpec("行动计划", "列出后续咨询、资料整理或下次督导前的具体行动。"),
        ),
    ),
    "case_report": ReportPromptSpec(
        report_type="case_report",
        display_name="个案报告",
        role="你是心理咨询个案报告写作助手，协助咨询师把多次资料整合成专业、审慎、可追溯的个案报告草稿。",
        objective="基于来访者档案和已选资料生成个案报告，强调长期脉络、案例概念化、工作过程和后续计划。",
        sections=(
            ReportSectionSpec("基本资料", "整理来访者编号、性别、咨询次数、时间跨度、主诉、资料来源等已知信息。"),
            ReportSectionSpec("问题概述", "整合主要困扰、症状/功能影响、重要生活事件和风险保护因素。"),
            ReportSectionSpec("案例概念化", "提出有资料支持的工作假设，说明触发因素、维持因素、资源和关系模式；避免确定性诊断。"),
            ReportSectionSpec("咨询过程", "按阶段总结咨询目标、主要干预、来访者变化和关键节点。"),
            ReportSectionSpec("风险评估", "仅基于资料列出风险线索、保护因素、危机处理或需要继续评估的内容。"),
            ReportSectionSpec("评估与计划", "总结当前进展、后续目标、建议频率、转介/会诊或其他专业建议。"),
        ),
    ),
}


def get_report_prompt_spec(report_type: str) -> ReportPromptSpec:
    return REPORT_PROMPT_SPECS[report_type]


def truncate_source(text: str, limit: int = MAX_SOURCE_CHARS) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[:limit]}...（已截断）"


def build_report_prompt(
    *,
    report_type: str,
    title: str,
    sources: list[ReportPromptSource],
) -> ReportPrompt:
    spec = get_report_prompt_spec(report_type)
    system_prompt = "\n".join([
        spec.role,
        "只依据用户提供的资料生成草稿，不编造未出现的人名、日期、诊断、风险或干预。",
        "涉及自伤、自杀、他伤、虐待、精神病性症状、物质滥用等风险时，必须用“资料显示/资料未提供/需要进一步评估”的措辞。",
        "输出必须是 JSON 对象，格式为 {\"blocks\":[{\"title\":\"段落标题\",\"content\":\"段落内容\"}],\"title\":\"报告标题\"}。",
        "blocks 的标题必须严格使用指定段落标题；内容应使用专业中文，避免夸大疗效和确定性诊断。",
    ])
    section_prompt = "\n".join(
        f"- {section.title}：{section.instruction}" for section in spec.sections
    )
    source_lines: list[str] = []
    total = 0
    for index, source in enumerate(sources, start=1):
        content = truncate_source(source.content)
        if total + len(content) > MAX_TOTAL_SOURCE_CHARS:
            content = "资料过长，已在提示词中省略；生成时只可使用已列出的其他资料。"
        total += len(content)
        source_lines.append(
            f"[资料{index}] {source.label}（{source.resource_type}:{source.resource_id}）\n{content}"
        )
    user_prompt = "\n\n".join([
        f"报告标题：{title}",
        f"报告类型：{spec.display_name}",
        f"生成目标：{spec.objective}",
        "请生成以下段落：\n" + section_prompt,
        "已选资料：\n" + ("\n\n".join(source_lines) if source_lines else "未选择资料"),
    ])
    return ReportPrompt(
        version=PROMPT_VERSION,
        report_type=report_type,
        title=title,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        sections=spec.sections,
        sources=tuple(sources),
    )
