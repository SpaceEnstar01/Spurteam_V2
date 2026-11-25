import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AgentReplyMarkdown } from '../components/AgentReplyMarkdown';
import type { RootStackParamList } from '../navigation/types';
import {
  listCodexTasks,
  readCodexReport,
  readCodexStatus,
  readCodexTask,
  submitCodexTask,
  type CodexTask,
} from '../services/codexApi';
import { Icon } from '../components/Icon';
import { useRingCodexSettings } from '../services/ringCodex';
import {
  getCreatorAgentUrl,
  newCreatorAgentRequestId,
} from '../services/creatorAgentApi';
import { colors } from '../theme/tokens';

const statusLabel = {
  queued: '等待执行',
  running: '正在执行',
  finished: '已完成',
  failed: '执行失败',
};
const dateLabel = (value?: string) =>
  value ? new Date(value).toLocaleString() : '';
const reason = (error: unknown) =>
  error instanceof Error ? error.message : '请求失败，请稍后重试。';

export function CodexChatScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'CodexChat'>) {
  const [tasks, setTasks] = useState<CodexTask[]>([]);
  const [earlier, setEarlier] = useState<CodexTask[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [input, setInput] = useState('');
  const [source, setSource] = useState<'ring'>();
  useEffect(() => {
    if (!route.params?.transcript) return;
    setInput(route.params.transcript);
    setSource(route.params.source);
    navigation.setParams({ transcript: undefined, source: undefined });
  }, [navigation, route.params?.transcript, route.params?.source]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const pending = useRef<{
    message: string;
    id: string;
    source?: 'ring';
  } | null>(null);
  const sendingNow = useRef(false);
  const loadingHistory = useRef(false);
  const paged = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const scrollToLatest = useRef(true);

  const refresh = useCallback(async () => {
    const page = await listCodexTasks();
    setTasks(page.tasks);
    if (!paged.current) setCursor(page.nextCursor);
  }, []);

  const ringOn = useRingCodexSettings(state => Boolean(state.base));
  const ringError = useRingCodexSettings(state => state.error);
  const setRingBase = useRingCodexSettings(state => state.setBase);
  const setRingError = useRingCodexSettings(state => state.setError);
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="戒指自动提交"
          accessibilityState={{ checked: ringOn }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          onPress={async () => {
            if (ringOn) return setRingBase(null);
            try {
              const base = await getCreatorAgentUrl();
              if (!base) throw new Error('请先配置 Personal Agent 服务地址。');
              setRingBase(base);
            } catch (failure) {
              setRingError(reason(failure));
            }
          }}
        >
          <Icon name="ring" size={20} />
          <Text>{ringOn ? '已开启' : '已关闭'}</Text>
        </Pressable>
      ),
    });
  }, [navigation, ringOn, setRingBase, setRingError]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let interval: ReturnType<typeof setTimeout>;
      async function poll() {
        const [status, history] = await Promise.allSettled([
          readCodexStatus(),
          listCodexTasks(),
        ]);
        if (!active) return;
        setConnected(
          status.status === 'fulfilled' && status.value.gatewayReachable,
        );
        if (history.status === 'fulfilled') {
          setTasks(history.value.tasks);
          if (!paged.current) setCursor(history.value.nextCursor);
        } else setError(reason(history.reason));
        interval = setTimeout(poll, 2500);
      }
      void poll();
      return () => {
        active = false;
        clearTimeout(interval);
      };
    }, []),
  );

  async function send() {
    const message = input.trim();
    if (!message || sendingNow.current) return;
    sendingNow.current = true;
    setSending(true);
    setError('');
    const target =
      pending.current?.message === message && pending.current.source === source
        ? pending.current
        : { message, id: newCreatorAgentRequestId(), source };
    pending.current = target;
    try {
      const submitted = await submitCodexTask(
        message,
        target.id,
        target.source,
      );
      pending.current = null;
      scrollToLatest.current = true;
      setTasks(existing => [
        submitted,
        ...existing.filter(task => task.id !== submitted.id),
      ]);
      setInput('');
      setSource(undefined);
      await refresh();
    } catch (failure) {
      setError(reason(failure));
    } finally {
      sendingNow.current = false;
      setSending(false);
    }
  }

  async function loadEarlier() {
    if (!cursor || loadingHistory.current) return;
    loadingHistory.current = true;
    try {
      const page = await listCodexTasks(cursor);
      paged.current = true;
      setEarlier(existing => [...existing, ...page.tasks]);
      setCursor(page.nextCursor);
    } catch (failure) {
      setError(reason(failure));
    } finally {
      loadingHistory.current = false;
    }
  }

  const visibleTasks = Array.from(
    new Map([...earlier, ...tasks].map(task => [task.id, task])).values(),
  ).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.connection, connected && styles.connected]}
        >
          {connected === null
            ? '正在检查连接'
            : connected
            ? '● 执行端已连接'
            : '○ 执行端未连接'}
        </Text>
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (scrollToLatest.current && visibleTasks.length) {
              scrollToLatest.current = false;
              scroll.current?.scrollToEnd({ animated: false });
            }
          }}
        >
          {cursor && (
            <Pressable accessibilityRole="button" onPress={loadEarlier}>
              <Text style={styles.link}>加载更早的任务</Text>
            </Pressable>
          )}
          {visibleTasks.map(task => (
            <View key={task.id} style={styles.exchange}>
              <Text style={styles.bubble}>{task.message}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`查看任务 ${task.title}`}
                style={styles.card}
                onPress={() =>
                  navigation.navigate('CodexTaskDetail', { taskId: task.id })
                }
              >
                <Text style={styles.title} numberOfLines={1}>
                  {task.title}
                </Text>
                {!!task.summary && (
                  <Text style={styles.secondary} numberOfLines={2}>
                    {task.summary}
                  </Text>
                )}
                <Text style={styles.secondary}>
                  {statusLabel[task.status]} {dateLabel(task.completedAt)}
                </Text>
                <Text style={styles.link}>查看详情 ›</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
        {!!ringError && <Text style={styles.error}>{ringError}</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="任务指令"
            style={styles.input}
            placeholder="向 ChatGPT 发送任务…"
            multiline
            value={input}
            maxLength={12000}
            editable={!sending}
            onChangeText={setInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="发送任务"
            style={[styles.send, (sending || !input.trim()) && styles.disabled]}
            disabled={sending || !input.trim()}
            onPress={send}
          >
            <Text style={styles.sendText}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function CodexTaskDetailScreen({
  route,
}: NativeStackScreenProps<RootStackParamList, 'CodexTaskDetail'>) {
  const { taskId } = route.params;
  const [task, setTask] = useState<CodexTask>();
  const [report, setReport] = useState('');
  const [error, setError] = useState('');
  useFocusEffect(
    useCallback(() => {
      let active = true;
      let interval: ReturnType<typeof setTimeout>;
      async function load() {
        try {
          const value = await readCodexTask(taskId);
          if (!active) return;
          setTask(value);
          if (value.hasReport) {
            const markdown = await readCodexReport(taskId);
            if (active) setReport(markdown);
          }
          if (!active) return;
          setError('');
          if (value.status === 'finished' || value.status === 'failed') return;
        } catch (failure) {
          if (active) setError(reason(failure));
        }
        if (active) interval = setTimeout(load, 2500);
      }
      void load();
      return () => {
        active = false;
        clearTimeout(interval);
      };
    }, [taskId]),
  );

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {!!error && <Text style={styles.error}>{error}</Text>}
        {task && (
          <>
            <Text style={styles.title}>原始指令</Text>
            <Text style={styles.body}>{task.message}</Text>
            <Text style={styles.title}>{statusLabel[task.status]}</Text>
            {!!task.startedAt && (
              <Text style={styles.secondary}>
                开始 {dateLabel(task.startedAt)}
              </Text>
            )}
            {!!task.completedAt && (
              <Text style={styles.secondary}>
                完成 {dateLabel(task.completedAt)}
              </Text>
            )}
            {task.logs?.map((log, index) => (
              <Text key={index} style={styles.secondary}>
                {log}
              </Text>
            ))}
            {!!task.error && <Text style={styles.error}>{task.error}</Text>}
            {(report || task.reply) && (
              <AgentReplyMarkdown>
                {report || task.reply || ''}
              </AgentReplyMarkdown>
            )}
            {!!report && (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    Share.share({ title: 'report.md', message: report }).catch(
                      error => setError(reason(error)),
                    )
                  }
                >
                  <Text style={styles.link}>分享 report.md 内容</Text>
                </Pressable>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, flexGrow: 1 },
  connection: { textAlign: 'center', color: '#686E64', paddingBottom: 12 },
  connected: { color: '#347348' },
  exchange: { gap: 10, marginBottom: 8 },
  bubble: {
    alignSelf: 'flex-end',
    maxWidth: '90%',
    backgroundColor: '#E1E8D8',
    padding: 12,
    borderRadius: 14,
    color: colors.text,
  },
  card: {
    alignSelf: 'flex-start',
    width: '90%',
    borderColor: '#DFE2DC',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, color: colors.text },
  secondary: { color: '#62685F', fontSize: 13 },
  link: { color: '#426546', paddingVertical: 5, fontWeight: '600' },
  error: { color: '#A32D2D', paddingHorizontal: 12 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    color: colors.text,
    borderColor: '#DFE2DC',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 116,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#587052',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  sendText: { fontSize: 23, color: '#FFF' },
});
