import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { IntentItem } from '../intent/model';
import { ConfirmOptions } from '../adaptive/ConfirmOptions';
import { confirmGroups } from '../adaptive/confirmChoices';

export function WorkspaceTaskUpdate({
  item,
  execution,
  progress,
  reply,
  questions: executionQuestions,
  error,
  disabled,
  onOpen,
  onAnswer,
}: {
  item: IntentItem;
  execution?: 'running' | 'done' | 'failed';
  progress?: string;
  reply?: string;
  questions?: string[];
  error?: string;
  disabled?: boolean;
  onOpen: () => void;
  onAnswer: (text: string) => void;
}) {
  const [answer, setAnswer] = useState('');
  const [editing, setEditing] = useState(false);
  const questions =
    execution === 'done' ? executionQuestions || [] : item.questions;
  const status =
    execution === 'running'
      ? '正在执行'
      : execution === 'failed'
      ? '执行未完成'
      : questions.length
      ? '需要你确认'
      : execution === 'done'
      ? 'Agent 有更新'
      : item.state === 'completed'
      ? '已完成'
      : '任务已加入 Workspace';
  const text =
    execution === 'running'
      ? progress || '正在处理任务…'
      : execution === 'failed'
      ? error || '执行未完成，请查看原因后重试。'
      : execution === 'done'
      ? reply || 'Agent 已返回，请查看详情。'
      : questions.join('\n') || item.summary;
  return (
    <View style={s.card}>
      <Text style={s.status}>{status}</Text>
      <Text style={s.title}>{item.title}</Text>
      <Text style={s.body} numberOfLines={execution === 'done' ? 5 : undefined}>
        {text.replace(/[*#`]/g, '')}
      </Text>
      <ConfirmOptions
        groups={confirmGroups(text, questions)}
        disabled={disabled || execution === 'running'}
        onSelect={onAnswer}
      />
      <View style={s.actions}>
        <Pressable accessibilityRole="button" onPress={onOpen} style={s.button}>
          <Text style={s.link}>查看任务与结果 ↗</Text>
        </Pressable>
        {execution !== 'running' && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setEditing(!editing)}
            style={s.button}
          >
            <Text style={s.link}>
              {questions.length ? '回答确认问题' : '补充要求 / 继续推进'}
            </Text>
          </Pressable>
        )}
      </View>
      {(questions.length > 0 || editing) && execution !== 'running' && (
        <View>
          <TextInput
            accessibilityLabel={`补充任务 ${item.title}`}
            value={answer}
            onChangeText={setAnswer}
            placeholder="在这里补充或回答，不必返回录音详情"
            style={s.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="提交并继续任务"
            disabled={disabled || !answer.trim()}
            onPress={() => {
              if (answer.trim()) {
                onAnswer(answer.trim());
                setAnswer('');
              }
            }}
            style={s.button}
          >
            <Text style={s.link}>提交并继续</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    padding: 18,
    backgroundColor: '#F5F6F2',
    borderRadius: 18,
    marginVertical: 10,
  },
  status: { fontSize: 12, color: '#64734F' },
  title: {
    fontSize: 18,
    color: '#172033',
    fontWeight: '600',
    marginVertical: 8,
  },
  body: { fontSize: 15, lineHeight: 23, color: '#354052' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { paddingVertical: 12, minHeight: 44 },
  link: { fontSize: 14, color: '#44683C' },
  input: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FFF',
    color: '#172033',
    marginTop: 8,
  },
});
