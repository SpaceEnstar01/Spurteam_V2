// Status metadata is display-only: it never grants tool or sending permission.
export const TASK_REPLY_PROTOCOL =
  '\n本轮是App任务执行。正常给出结果或具体阻塞，不写空泛未来计划。在回答最后附一段状态JSON：<<SPUR_TASK_UPDATE>>{"questions":[]}<<END_SPUR_TASK_UPDATE>>。仅当确实需要用户补充关键条件或授权时questions填写最多5个简短问题，可包含“选项：甲、乙、丙”；可选日期范围用默认值，不应放入questions。此标记不代表执行成功，绝不捏造工具结果。';

export function parseTaskReply(raw: string): {
  response: string;
  questions: string[];
} {
  const marker = /<<SPUR_TASK_UPDATE>>([\s\S]*?)<<END_SPUR_TASK_UPDATE>>\s*$/;
  const match = raw.match(marker);
  if (!match) return { response: raw, questions: [] };
  const response = raw.replace(marker, '').trim();
  try {
    const value = JSON.parse(match[1]);
    if (
      !Array.isArray(value.questions) ||
      value.questions.length > 5 ||
      value.questions.some(
        (q: unknown) => typeof q !== 'string' || !q.trim() || q.length > 500,
      )
    )
      throw new Error('Invalid questions');
    return {
      response: response || 'Agent 已返回更新，请核对任务状态。',
      questions: value.questions,
    };
  } catch {
    return {
      response: response || 'Agent 的确认信息未通过校验，请重试。',
      questions: [],
    };
  }
}
