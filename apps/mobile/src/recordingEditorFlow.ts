export type RegenerationDecision =
  | { status: "confirm"; message: string }
  | { status: "regenerating"; message: string };

export function decideRecordingRegeneration(hasManualEdits: boolean, confirmed: boolean): RegenerationDecision {
  if (hasManualEdits && !confirmed) {
    return {
      status: "confirm",
      message: "当前纪要或转写包含人工修改。重新生成会覆盖这些修改，但不会覆盖已保存的正式记录。",
    };
  }
  return {
    status: "regenerating",
    message: "已提交重新生成任务。生成失败时保留当前内容，成功后更新纪要、章节和转写。",
  };
}

export function updateAtIndex<T>(items: T[], index: number, next: T): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? next : item));
}
