import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { WorkspaceTaskUpdate } from '../src/components/WorkspaceTaskUpdate';
import type { IntentItem } from '../src/intent/model';
const item = {
  id: 'task',
  title: '分析我的频道',
  kind: 'instruction',
  frame: 'clarification',
  summary: '分析频道',
  questions: ['你要分析哪个已连接频道？'],
  state: 'needs_clarification',
} as IntentItem;
let renderer: TestRenderer.ReactTestRenderer;
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
});
test('blocking question and reply input are directly available in the task update', () => {
  const onAnswer = jest.fn();
  act(() => {
    renderer = TestRenderer.create(
      <WorkspaceTaskUpdate
        item={item}
        onAnswer={onAnswer}
        onOpen={jest.fn()}
      />,
    );
  });
  expect(JSON.stringify(renderer.toJSON())).toContain('需要你确认');
  act(() =>
    renderer.root.findByType(TextInput).props.onChangeText('使用LEO频道'),
  );
  const button = renderer.root.findAll(
    n =>
      typeof n.props.onPress === 'function' &&
      n.props.accessibilityLabel === '提交并继续任务',
  )[0];
  act(() => button.props.onPress());
  expect(onAnswer).toHaveBeenCalledWith('使用LEO频道');
});
test('returned response is an update, never fabricated successful completion; failure remains visible', () => {
  act(() => {
    renderer = TestRenderer.create(
      <WorkspaceTaskUpdate
        item={item}
        execution="done"
        reply="需要重新连接YouTube授权。"
        onAnswer={jest.fn()}
        onOpen={jest.fn()}
      />,
    );
  });
  const output = JSON.stringify(renderer.toJSON());
  expect(output).toContain('Agent 有更新');
  expect(output).toContain('需要重新连接YouTube授权');
  expect(output).not.toContain('已完成');
  act(() =>
    renderer.update(
      <WorkspaceTaskUpdate
        item={item}
        execution="failed"
        error="授权已失效"
        onAnswer={jest.fn()}
        onOpen={jest.fn()}
      />,
    ),
  );
  expect(JSON.stringify(renderer.toJSON())).toContain('授权已失效');
});
test('execution returning a blocking question stays actionable on the homepage instead of becoming completed', () => {
  act(() => { renderer = TestRenderer.create(<WorkspaceTaskUpdate item={item} execution="done" reply="当前授权不可用。" questions={['请重新连接YouTube后告诉我继续。']} onAnswer={jest.fn()} onOpen={jest.fn()} />); });
  expect(JSON.stringify(renderer.toJSON())).toContain('需要你确认');
  expect(renderer.root.findByType(TextInput)).toBeTruthy();
});
