export type SupervisionContext = {
  id: string;
  title: string;
  type: string;
};

export type SupervisionReply = {
  text: string;
  citations: string[];
};

export function buildSupervisionReply(question: string, contexts: SupervisionContext[]): SupervisionReply {
  const topic = question.trim() || "本次督导准备";
  if (contexts.length === 0) {
    return {
      text: `关于“${topic}”，可以先按事实、咨询师反应、风险与下一步行动四部分整理。当前回答未读取任何档案资料。`,
      citations: [],
    };
  }

  return {
    text: `关于“${topic}”，建议先核对最近一次记录中的触发事件和风险变化，再把仍不确定的干预选择整理为 2 到 3 个可讨论问题。`,
    citations: contexts.map((context) => `${context.type}：${context.title}`),
  };
}
