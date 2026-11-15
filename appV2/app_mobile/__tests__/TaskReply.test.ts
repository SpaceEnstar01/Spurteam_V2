import { parseTaskReply } from '../src/intent/taskReply';
test('confirmation is separate from a normal returned response and never declares completion', () => {
  expect(parseTaskReply('请重新授权。<<SPUR_TASK_UPDATE>>{"questions":["请在连接应用中重新连接YouTube。"]}<<END_SPUR_TASK_UPDATE>>')).toEqual({
    response: '请重新授权。', questions: ['请在连接应用中重新连接YouTube。'],
  });
  expect(parseTaskReply('工具返回零条数据。')).toEqual({ response: '工具返回零条数据。', questions: [] });
});
test('malformed status metadata cannot create confirmation actions or leak its JSON into the reply', () => {
  const result = parseTaskReply('原文保留。<<SPUR_TASK_UPDATE>>{"questions":[{"send":true}]}<<END_SPUR_TASK_UPDATE>>');
  expect(result).toEqual({ response: '原文保留。', questions: [] });
});
