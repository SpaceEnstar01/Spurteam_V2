import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { WorkspaceReminders } from '../src/components/WorkspaceReminders';
import { useIntentStore } from '../src/intent/store';
import type { Capture, Interpretation } from '../src/intent/model';
import { confirmedReminderTime, reminderDay } from '../src/intent/reminders';

const recordedAt = new Date(2026, 10, 9, 22).getTime();
const source = {
  key: 'test-reminder',
  text: '明天下午提醒我联系Jack讨论苏州拍摄',
  title: '录音',
  capturedAt: recordedAt,
  timeTrusted: true,
};
const intent: Interpretation = {
  kind: 'instruction',
  frame: 'reminder',
  title: '联系Jack讨论苏州拍摄',
  summary: '联系Jack',
  sourceSpan: source.text,
  confidence: 0.95,
  actor: '',
  counterparty: 'Jack',
  deliverable: '',
  direction: 'unknown',
  dateText: '明天下午',
  sections: [],
  checklist: [],
  questions: ['明天下午几点提醒你？'],
  email: null,
  change: 'update',
};
let renderer: TestRenderer.ReactTestRenderer;
const click = (label: string) => {
  const node = renderer.root.findAll(
    n =>
      n.props.accessibilityLabel === label &&
      typeof n.props.onPress === 'function',
  )[0];
  act(() => node.props.onPress());
};
const latest = () => useIntentStore.getState().captures[source.key].items[0];
beforeEach(async () => {
  await Promise.resolve();
  jest.useFakeTimers().setSystemTime(recordedAt);
  useIntentStore.setState({ captures: {}, loadError: '' });
  const revision = useIntentStore.getState().begin(source);
  useIntentStore.getState().finish(source, revision, [intent]);
});
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  jest.useRealTimers();
});

test('Workspace asks time and explicit selection updates the same durable item, then becomes due and completes', () => {
  act(() => {
    renderer = TestRenderer.create(<WorkspaceReminders />);
  });
  expect(JSON.stringify(renderer.toJSON())).toContain('几点提醒你');
  const id = latest().id;
  click('14:00');
  expect(latest()).toMatchObject({
    id,
    state: 'pending',
    dueAt: new Date(2026, 10, 10, 14).getTime(),
  });
  expect(JSON.stringify(renderer.toJSON())).toContain('已设置 App 内提醒');
  act(() => {
    jest.setSystemTime(new Date(2026, 10, 10, 14, 1));
    jest.advanceTimersByTime(1000);
  });
  expect(JSON.stringify(renderer.toJSON())).toContain('到时间了');
  click('已完成');
  expect(latest()).toMatchObject({ id, state: 'completed' });
});

test('snoozing retains identity and cancelling prevents the due reminder from returning', () => {
  act(() => {
    renderer = TestRenderer.create(<WorkspaceReminders />);
  });
  click('15:00');
  const id = latest().id;
  act(() => {
    jest.setSystemTime(new Date(2026, 10, 10, 16));
    jest.advanceTimersByTime(1000);
  });
  click('稍后10分钟');
  expect(latest().id).toBe(id);
  expect(latest().dueAt).toBeGreaterThan(Date.now());
  click('取消提醒');
  act(() => {
    jest.advanceTimersByTime(3600000);
  });
  expect(latest().state).toBe('cancelled');
  expect(JSON.stringify(renderer.toJSON())).not.toContain('到时间了');
});

test('a restored overdue reminder appears immediately without waiting for another timer or model call', () => {
  const item = latest();
  useIntentStore
    .getState()
    .change(item.id, item.revision, { dueAt: recordedAt + 60000 }, 'confirmed');
  jest.setSystemTime(recordedAt + 120000);
  act(() => {
    renderer = TestRenderer.create(<WorkspaceReminders />);
  });
  expect(JSON.stringify(renderer.toJSON())).toContain('到时间了');
});

test('day is anchored to capture time, untrusted dates need confirmation, invalid or past custom times reject', () => {
  const capture = useIntentStore.getState().captures[source.key];
  expect(reminderDay(capture, latest())).toBe('2026-11-10');
  expect(
    reminderDay(
      { ...capture, source: { ...source, timeTrusted: false } } as Capture,
      latest(),
    ),
  ).toBe('');
  expect(() => confirmedReminderTime('2026-02-30 15:00', recordedAt)).toThrow();
  expect(() => confirmedReminderTime('2026-11-09 15:00', recordedAt)).toThrow();
});
