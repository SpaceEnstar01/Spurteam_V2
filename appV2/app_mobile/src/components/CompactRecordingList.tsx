import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { vendorModule } from '../ring/native';
import type { RingRecording } from '../ring/types';
import { phoneAudio } from '../services/phoneAudio';
import { Icon } from './Icon';

export type RecordingEntry = {
  id: string;
  title: string;
  text: string;
  time: number;
  uri?: string;
  file?: RingRecording;
};

const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
});
const yearFormat = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const dayKey = (date: Date) =>
  [date.getFullYear(), date.getMonth(), date.getDate()].join('-');

export function groupRecordings(entries: RecordingEntry[], now = new Date()) {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const sections = new Map<
    string,
    { key: string; title: string; data: RecordingEntry[] }
  >();
  for (const entry of [...entries].sort((a, b) => b.time - a.time)) {
    const date = new Date(entry.time);
    const key = dayKey(date);
    const existing = sections.get(key);
    if (existing) {
      existing.data.push(entry);
      continue;
    }
    const label =
      key === dayKey(now)
        ? '今天 · '
        : key === dayKey(yesterday)
        ? '昨天 · '
        : '';
    const format =
      label || date.getFullYear() === now.getFullYear()
        ? dateFormat
        : yearFormat;
    sections.set(key, {
      key,
      title: label + format.format(date),
      data: [entry],
    });
  }
  return Array.from(sections.values());
}

function durationLabel(seconds: number | null) {
  if (seconds === null) return '—';
  const whole = Math.floor(seconds);
  return [Math.floor(whole / 60), whole % 60]
    .map(n => String(n).padStart(2, '0'))
    .join(':');
}

const RecordingRow = memo(function RecordingRow({
  entry,
  durations,
  onOpen,
  onManage,
}: {
  entry: RecordingEntry;
  durations: Map<string, number | null>;
  onOpen: (entry: RecordingEntry) => void;
  onManage: (entry: RecordingEntry) => void;
}) {
  const file = entry.file;
  const uri = file?.uri;
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    let mounted = true;
    setSeconds(uri ? durations.get(uri) ?? null : null);
    if (uri && !durations.has(uri) && phoneAudio?.recordingDuration) {
      phoneAudio.recordingDuration(uri).then(
        value => {
          const duration =
            value !== null && Number.isFinite(value) && value > 0
              ? value
              : null;
          durations.set(uri, duration);
          if (mounted) setSeconds(duration);
        },
        () => {},
      );
    }
    return () => {
      mounted = false;
    };
  }, [uri, durations]);

  const status =
    file?.recognitionState === 'working'
      ? '转写中'
      : file?.recognitionState === 'failed'
      ? '转写失败'
      : file?.aiReplyState === 'failed' || file?.personalAgentState === 'failed'
      ? '分析失败'
      : undefined;
  async function play() {
    if (!file) return;
    try {
      if (file.source === 'phone') {
        await phoneAudio.play(file.uri);
      } else {
        await vendorModule().playRecording(file.uri);
      }
    } catch (error) {
      Alert.alert(
        '播放失败',
        error instanceof Error ? error.message : '无法播放这条录音',
      );
    }
  }

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`查看 ${entry.title}${status ? '，' + status : ''}`}
        accessibilityHint="长按管理录音"
        delayLongPress={450}
        onPress={() => onOpen(entry)}
        onLongPress={() => onManage(entry)}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <Text style={styles.time}>{timeFormat.format(entry.time)}</Text>
        <Text numberOfLines={1} style={styles.title}>
          {entry.title || entry.text || '录音'}
        </Text>
        {!!status && (
          <Text numberOfLines={1} style={styles.status}>
            {status}
          </Text>
        )}
      </Pressable>
      <Text style={styles.duration}>{durationLabel(seconds)}</Text>
      {file ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`播放 ${entry.title}`}
          style={styles.play}
          onPress={play}
        >
          <Icon name="play" size={16} color="#626D60" />
        </Pressable>
      ) : (
        <View style={styles.play} />
      )}
    </View>
  );
});

export function CompactRecordingList({
  entries,
  query,
  onOpen,
  onManage,
  header,
  empty,
}: {
  entries: RecordingEntry[];
  query: string;
  onOpen: (entry: RecordingEntry) => void;
  onManage: (entry: RecordingEntry) => void;
  header?: React.ReactElement;
  empty: React.ReactElement;
}) {
  const [durations] = useState(() => new Map<string, number | null>());
  const sections = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return groupRecordings(
      term
        ? entries.filter(entry =>
            [
              entry.title,
              entry.text,
              entry.file?.transcript,
              entry.file?.aiReply,
              entry.file?.personalAgentReply,
            ].some(value => value?.toLocaleLowerCase().includes(term)),
          )
        : entries,
    );
  }, [entries, query]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={entry => entry.id}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      initialNumToRender={16}
      windowSize={7}
      ListHeaderComponent={header}
      ListEmptyComponent={
        query.trim() ? (
          <Text style={styles.noResults}>未找到匹配的录音</Text>
        ) : (
          empty
        )
      }
      renderSectionHeader={({ section }) => (
        <Text accessibilityRole="header" style={styles.date}>
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => (
        <RecordingRow
          entry={item}
          durations={durations}
          onOpen={onOpen}
          onManage={onManage}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingBottom: 12 },
  date: { paddingTop: 10, paddingBottom: 4, fontSize: 12, color: '#62695D' },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E6E8E1',
  },
  main: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pressed: { backgroundColor: '#F3F4EF' },
  time: {
    fontSize: 12,
    color: '#62695D',
    fontVariant: ['tabular-nums'],
    minWidth: 39,
  },
  title: { flex: 1, minWidth: 0, fontSize: 14, color: '#222622' },
  status: { fontSize: 11, color: '#786450', maxWidth: 64 },
  duration: {
    fontSize: 12,
    color: '#62695D',
    fontVariant: ['tabular-nums'],
    minWidth: 40,
    marginLeft: 8,
    textAlign: 'right',
  },
  play: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noResults: { paddingVertical: 24, color: '#62695D', textAlign: 'center' },
});
