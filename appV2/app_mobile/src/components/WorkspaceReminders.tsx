import React, { useEffect, useState } from 'react';
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Capture, IntentItem } from '../intent/model';
import { useIntentStore } from '../intent/store';
import {
  confirmedReminderTime,
  reminderDay,
  reminderPhase,
} from '../intent/reminders';

export function WorkspaceReminders() {
  const captures = useIntentStore(s => s.captures);
  const loadError = useIntentStore(s => s.loadError);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setInterval(refresh, 1000);
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      app.remove();
    };
  }, []);
  const rows = Object.values(captures)
    .flatMap(capture =>
      capture.state === 'done'
        ? capture.items
            .filter(
              item =>
                item.frame === 'reminder' &&
                !item.archived &&
                !['superseded', 'paused'].includes(item.state),
            )
            .map(item => ({ capture, item }))
        : [],
    )
    .sort((a, b) => {
      const rank = (item: IntentItem) =>
        ({ due: 0, clarify: 1, scheduled: 2, completed: 3, cancelled: 4 }[
          reminderPhase(item, now)
        ]);
      return (
        rank(a.item) - rank(b.item) ||
        (a.item.dueAt ?? Infinity) - (b.item.dueAt ?? Infinity)
      );
    });
  if (!rows.length) return null;
  return (
    <View>
      <Text style={s.heading}>你的提醒</Text>
      {!!loadError && (
        <Text style={s.error}>提醒未能保存，请检查本机存储：{loadError}</Text>
      )}
      {rows.map(({ capture, item }) => (
        <ReminderCard
          key={item.id}
          capture={capture}
          item={item}
          now={now}
          blocked={!!loadError}
        />
      ))}
    </View>
  );
}

function ReminderCard({
  capture,
  item,
  now,
  blocked,
}: {
  capture: Capture;
  item: IntentItem;
  now: number;
  blocked: boolean;
}) {
  const phase = reminderPhase(item, now);
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState('');
  const [error, setError] = useState('');
  const day = reminderDay(capture, item);
  const period = item.dateText + item.sourceSpan;
  const suggestions = /早上|上午|早晨/.test(period)
    ? ['08:00', '09:00']
    : /晚上|傍晚/.test(period)
    ? ['19:00', '20:00']
    : ['14:00', '15:00'];
  const changeTime = (value: string) => {
    try {
      const dueAt = confirmedReminderTime(value, Date.now());
      useIntentStore.getState().change(
        item.id,
        item.revision,
        {
          dueAt,
          dueTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        'User confirmed an in-app reminder time in Workspace.',
      );
      setEditing(false);
      setError('');
    } catch (cause) {
      setError((cause as Error).message);
    }
  };
  const transition = (state: 'completed' | 'cancelled') => {
    try {
      useIntentStore.getState().transition(item.id, item.revision, state);
      setError('');
    } catch (cause) {
      setError((cause as Error).message);
    }
  };
  const button = (label: string, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={blocked}
      onPress={onPress}
      style={s.button}
    >
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>
  );
  const terminal = phase === 'completed' || phase === 'cancelled';
  return (
    <View style={[s.card, phase === 'due' && s.due]}>
      <Text style={s.status}>
        {
          {
            clarify: '待确认时间',
            scheduled: '已设置 App 内提醒',
            due: '到时间了',
            completed: '已完成',
            cancelled: '已取消',
          }[phase]
        }
      </Text>
      <Text style={s.title}>{item.title}</Text>
      <Text style={s.meta}>
        {item.dueAt
          ? new Date(item.dueAt).toLocaleString('zh-CN')
          : `${item.dateText || '日期未确定'} · 待确认`}
      </Text>
      {phase === 'clarify' && (
        <Text style={s.body}>
          {day
            ? `${day} 几点提醒你？`
            : '请确认具体日期和时间。录音时间不明确时，不自动推算“明天”。'}
        </Text>
      )}
      {phase === 'due' && (
        <Text style={s.body}>
          该处理这件事了。你可以标记完成，或稍后再提醒。
        </Text>
      )}
      {!terminal && (phase === 'clarify' || editing) && (
        <View>
          {!!day && (
            <View style={s.actions}>
              {suggestions.map(hour =>
                button(hour, () => changeTime(`${day} ${hour}`)),
              )}
            </View>
          )}
          <Text style={s.meta}>手机本地时间 · 年-月-日 时:分</Text>
          <TextInput
            accessibilityLabel={`提醒时间 ${item.title}`}
            placeholder="例如 2026-11-10 15:00"
            value={time}
            onChangeText={setTime}
            style={s.input}
          />
          {button('确认时间', () => changeTime(time))}
        </View>
      )}
      {!terminal && (
        <View style={s.actions}>
          {phase === 'due' && button('已完成', () => transition('completed'))}
          {phase === 'due' &&
            button('稍后10分钟', () => {
              const date = new Date(Date.now() + 600000);
              const value = `${date.getFullYear()}-${String(
                date.getMonth() + 1,
              ).padStart(2, '0')}-${String(date.getDate()).padStart(
                2,
                '0',
              )} ${String(date.getHours()).padStart(2, '0')}:${String(
                date.getMinutes(),
              ).padStart(2, '0')}`;
              changeTime(value);
            })}
          {phase === 'scheduled' &&
            button('修改时间', () => setEditing(!editing))}
          {button('取消提醒', () => transition('cancelled'))}
        </View>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {!terminal && (
        <Text style={s.meta}>
          保存在此手机；App 打开时到点展示，关闭后重开可查看。不发送系统通知。
        </Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  heading: { fontSize: 16, fontWeight: '600', marginTop: 16, color: '#172033' },
  card: {
    backgroundColor: '#F4F5EF',
    padding: 18,
    borderRadius: 18,
    marginVertical: 9,
  },
  due: { backgroundColor: '#FFF1D8' },
  status: { fontSize: 12, color: '#64734F' },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#172033',
    marginVertical: 8,
  },
  body: { fontSize: 15, lineHeight: 23, color: '#354052', marginVertical: 8 },
  meta: { fontSize: 12, color: '#70797E', lineHeight: 18, marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  button: {
    minHeight: 44,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#172033',
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  buttonText: { color: '#FFF', fontSize: 14 },
  input: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    color: '#172033',
  },
  error: { color: '#AD4545', fontSize: 13, marginTop: 8 },
});
