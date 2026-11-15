import { parseTaskReply, TASK_REPLY_PROTOCOL } from '../intent/taskReply';
import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useRecordingStore } from '../ring/store/useRecordingStore';
import {
  newCreatorAgentRequestId,
  runCreatorAgentTask,
} from './creatorAgentApi';
import { recordingKey, sameRecording } from '../ring/recordingIdentity';
import { parseEnvelope } from '../intent/model';
import {
  CAPTURE_PROTOCOL,
  REMINDER_PROTOCOL,
  TASK_EXECUTION_PROTOCOL,
} from '../intent/prompt';
import { recordingSource, beginInterpretation } from '../intent/runtime';
import { useIntentStore } from '../intent/store';

type ReplySettings = {
  choice: 'undecided' | 'enabled' | 'disabled';
  excludedUris: string[];
  choose: (enabled: boolean) => void;
};
export const useReplySettings = create<ReplySettings>()(
  persist(
    set => ({
      choice: 'undecided',
      excludedUris: [],
      choose: enabled => {
        // Include the latest existing recording, not a surprise batch of old notes.
        const files = [...useRecordingStore.getState().files].sort(
          (a, b) => b.timestamp - a.timestamp,
        );
        set({
          choice: enabled ? 'enabled' : 'disabled',
          excludedUris: files.slice(1).map(file => file.uri),
        });
      },
    }),
    {
      name: 'spur-automatic-reply-v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export function confirmEnableAutomaticReplies() {
  Alert.alert(
    '开启录音自动理解？',
    '将最新一条已有及后续新增录音的文字发送至已配置的 Personal Agent，自动整理想法、提取待办；明确的公开网页研究请求会自动执行。其他外部操作仍需确认。音频不上传，不批量处理其他历史录音，可随时关闭。',
    [
      {
        text: '仅本机识别',
        style: 'cancel',
        onPress: () => useReplySettings.getState().choose(false),
      },
      {
        text: '开启自动理解',
        onPress: () => useReplySettings.getState().choose(true),
      },
    ],
    { cancelable: false },
  );
}

const inFlight = new Map<
  string,
  { controller: AbortController; task: Promise<void> }
>();
const personalAgentInFlight = new Map<string, Promise<void>>();

/** Send only this recording's on-device transcript to the cloud Personal Agent. */
export function submitRecordingToPersonalAgent(
  uri: string,
  researchRequests?: string[],
  signal?: AbortSignal,
): Promise<void> {
  const key = recordingKey(uri);
  const existing = personalAgentInFlight.get(key);
  if (existing) return existing;
  const file = useRecordingStore
    .getState()
    .files.find(item => sameRecording(item.uri, uri));
  if (!file?.transcript?.trim())
    return Promise.reject(new Error('请先完成录音文字识别'));
  const transcript = file.transcript.trim();
  const requestId = newCreatorAgentRequestId();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  if (signal?.aborted) controller.abort();
  const updateItems = (
    update: NonNullable<
      import('../intent/model').IntentItem['executionUpdate']
    >,
  ) => {
    const capture = useIntentStore.getState().captures[key];
    for (const item of capture?.items || []) {
      if (item.kind !== 'instruction' || item.frame === 'reminder') continue;
      if (researchRequests && !researchRequests.includes(item.sourceSpan))
        continue;
      useIntentStore.getState().updateExecution(item.id, transcript, update);
    }
  };
  const task = Promise.resolve().then(async () => {
    updateItems({
      state: 'running',
      progress: '正在连接云端 Personal Agent',
      reply: undefined,
      questions: undefined,
      error: undefined,
      requestId,
    });
    useRecordingStore.getState().setReply(uri, {
      personalAgentRunId: requestId,
      personalAgentState: 'running',
      personalAgentProgress: '正在连接云端 Personal Agent',
      personalAgentReply: undefined,
      personalAgentQuestions: undefined,
      personalAgentSources: undefined,
      personalAgentArtifacts: undefined,
      personalAgentError: undefined,
    });
    try {
      const result = await runCreatorAgentTask({
        requestId,
        signal: controller.signal,
        message: [
          '以下是用户刚刚在 Spur App 录音后由手机本机识别出的语音内容。请把它当作用户本轮的原始请求，按其真实意图执行，并用中文回复。',
          '请实际调用可用工具完成只读请求。分析自己的YouTube频道先读取已授权频道和Analytics，未指定范围默认最近28个完整UTC日并在结果中说明，不为可选范围提问。授权缺失或目标确实不明确时才简短询问。不得以分析计划代替结果，没读到数据不得编造结论。涉及发送、购买、删除等外部操作时先请求确认。',
          researchRequests
            ? '本次只执行以下已从录音提取的只读任务（公开研究或读取用户已授权应用数据）。使用已授权连接读取真实数据；不要登录、发送、发布、删除、交易或修改外部数据；遇到需要此类操作时停止并询问。'
            : '',
          `录音转写：\n${
            researchRequests ? researchRequests.join('\n') : transcript
          }`,
          TASK_REPLY_PROTOCOL,
        ].join('\n\n'),
        onProgress: progress => {
          const current = useRecordingStore
            .getState()
            .files.find(item => sameRecording(item.uri, uri));
          if (
            current?.transcript === file.transcript &&
            !controller.signal.aborted
          ) {
            updateItems({ progress: progress.progress });
            useRecordingStore.getState().setReply(uri, {
              personalAgentState: 'running',
              personalAgentProgress: progress.progress,
              personalAgentRunId: requestId,
            });
          }
        },
      });
      const current = useRecordingStore
        .getState()
        .files.find(item => sameRecording(item.uri, uri));
      if (controller.signal.aborted || current?.transcript !== file.transcript)
        throw new Error('录音文字已更新或请求已停止，请核对后重试');
      const update = parseTaskReply(result.response);
      updateItems({
        state: 'responded',
        reply: update.response,
        questions: update.questions,
        requestId: result.requestId,
        error: undefined,
      });
      useRecordingStore.getState().setReply(uri, {
        personalAgentRunId: result.requestId,
        personalAgentState: 'done',
        personalAgentProgress: update.questions.length
          ? '需要你确认'
          : 'Agent 已返回执行反馈',
        personalAgentReply: update.response,
        personalAgentQuestions: update.questions,
        personalAgentSources: result.sources,
        personalAgentArtifacts: result.artifacts,
        personalAgentError: undefined,
      });
    } catch (error) {
      updateItems({ state: 'failed', error: (error as Error).message });
      const current = useRecordingStore
        .getState()
        .files.find(item => sameRecording(item.uri, uri));
      if (current?.transcript === file.transcript)
        useRecordingStore.getState().setReply(uri, {
          personalAgentState: 'failed',
          personalAgentProgress: undefined,
          personalAgentError: (error as Error).message,
        });
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
      personalAgentInFlight.delete(key);
    }
  });
  personalAgentInFlight.set(key, task);
  return task;
}

export function cancelRecordingReply(uri: string) {
  inFlight.get(recordingKey(uri))?.controller.abort();
}

export function generateRecordingReply(uri: string): Promise<void> {
  const key = recordingKey(uri);
  const existing = inFlight.get(key);
  if (existing) return existing.task;
  const file = useRecordingStore
    .getState()
    .files.find(item => sameRecording(item.uri, uri));
  if (!file?.transcript?.trim())
    return Promise.reject(new Error('请先完成录音文字识别'));
  const transcript = file.transcript;
  if (transcript.length > 8000)
    return Promise.reject(
      new Error('录音文字超过 8000 字，请在笔记中分段后发送 AI'),
    );
  const controller = new AbortController();
  // Queue the work by one microtask so the registry is populated before store events.
  const task = Promise.resolve().then(async () => {
    const source = recordingSource(file);
    let intentRevision: number | undefined;
    useRecordingStore.getState().setReply(uri, {
      aiReply: undefined,
      aiReplyState: 'working',
      aiReplyError: undefined,
    });
    try {
      if (controller.signal.aborted) throw new Error('AI 回复已取消');
      {
        intentRevision = await beginInterpretation(source);
        let result = await runCreatorAgentTask({
          requestId: newCreatorAgentRequestId(),
          signal: controller.signal,
          message:
            CAPTURE_PROTOCOL +
            REMINDER_PROTOCOL +
            TASK_EXECUTION_PROTOCOL +
            '\n本条录音原文：\n' +
            transcript,
        });
        let parsed;
        try {
          parsed = parseEnvelope(result.response, transcript);
        } catch {
          if (controller.signal.aborted) throw new Error('录音理解已取消');
          // One schema repair only; no research or external actions in this request.
          result = await runCreatorAgentTask({
            requestId: newCreatorAgentRequestId(),
            signal: controller.signal,
            message:
              CAPTURE_PROTOCOL +
              REMINDER_PROTOCOL +
              TASK_EXECUTION_PROTOCOL +
              '\n上次分类格式不符合协议。重新理解下列原文，仅输出上述合法JSON与枚举，不调用工具；不重放之前的执行。\n本条录音原文：\n' +
              transcript,
          });
          try {
            parsed = parseEnvelope(result.response, transcript);
          } catch {
            throw new Error('录音意图格式未通过校验，原文已保留，请重试理解。');
          }
        }
        const current = useRecordingStore
          .getState()
          .files.find(item => sameRecording(item.uri, uri));
        if (controller.signal.aborted || current?.transcript !== transcript)
          throw new Error('录音已更新或分析已取消');
        useIntentStore
          .getState()
          .finish(source, intentRevision, parsed.intents);
        useRecordingStore.getState().setReply(uri, {
          aiReply: parsed.reply,
          aiReplyState: 'done',
          aiReplyError: undefined,
        });
        const requests = parsed.intents
          .filter(
            item =>
              item.execution === 'research' ||
              item.execution === 'connected_read',
          )
          .map(item => item.sourceSpan);
        // Classification is settled before execution. Tool failures have their own retry state.
        if (requests.length)
          await submitRecordingToPersonalAgent(
            uri,
            requests,
            controller.signal,
          ).catch(() => undefined);
        return;
      }
    } catch (error) {
      if (intentRevision !== undefined)
        useIntentStore
          .getState()
          .fail(source.key, intentRevision, (error as Error).message);
      const message = controller.signal.aborted
        ? 'AI 回复已暂停，已生成内容已保留，可点击重试'
        : (error as Error).message;
      const current = useRecordingStore
        .getState()
        .files.find(item => sameRecording(item.uri, uri));
      if (current?.transcript === transcript)
        useRecordingStore
          .getState()
          .setReply(uri, { aiReplyState: 'failed', aiReplyError: message });
      throw new Error(message);
    } finally {
      inFlight.delete(key);
    }
  });
  inFlight.set(key, { controller, task });
  return task;
}

export function startAutomaticReplies() {
  let stopped = false;
  let running = false;
  let active = AppState.currentState === 'active';
  let currentUri: string | undefined;
  // An interrupted request may already have reached the provider. Require manual retry.
  useRecordingStore
    .getState()
    .files.filter(
      file =>
        file.aiReplyState === 'working' &&
        !inFlight.has(recordingKey(file.uri)),
    )
    .forEach(file =>
      useRecordingStore.getState().setReply(file.uri, {
        aiReplyState: 'failed',
        aiReplyError: '上次 AI 回复未完成，请点击重试',
      }),
    );
  useRecordingStore
    .getState()
    .files.filter(
      file =>
        file.personalAgentState === 'running' &&
        !personalAgentInFlight.has(recordingKey(file.uri)),
    )
    .forEach(file =>
      useRecordingStore.getState().setReply(file.uri, {
        personalAgentState: 'failed',
        personalAgentProgress: undefined,
        personalAgentError: '上次任务连接已中断，请先核对结果后重试。',
      }),
    );
  const enabled = () => useReplySettings.getState().choice === 'enabled';
  const pump = async () => {
    if (stopped || running || !active || !enabled()) return;
    running = true;
    try {
      while (!stopped && active && enabled()) {
        const file = useRecordingStore
          .getState()
          .files.find(
            item =>
              item.transcript?.trim() &&
              !item.aiReply &&
              !item.aiReplyState &&
              !useReplySettings
                .getState()
                .excludedUris.some(uri => sameRecording(uri, item.uri)),
          );
        if (!file) break;
        currentUri = file.uri;
        try {
          await generateRecordingReply(file.uri);
        } catch (error) {
          // Validation failures must also settle; otherwise the queue would retry forever.
          const current = useRecordingStore
            .getState()
            .files.find(item => sameRecording(item.uri, file.uri));
          if (current?.transcript === file.transcript)
            useRecordingStore.getState().setReply(file.uri, {
              aiReplyState: 'failed',
              aiReplyError: (error as Error).message,
            });
        } finally {
          currentUri = undefined;
        }
      }
    } finally {
      running = false;
    }
  };
  const unsubscribe = useRecordingStore.subscribe(state => {
    if (
      currentUri &&
      !state.files.some(file => sameRecording(file.uri, currentUri))
    )
      cancelRecordingReply(currentUri);
    pump();
  });
  const settings = useReplySettings.subscribe(() => {
    if (!enabled() && currentUri) cancelRecordingReply(currentUri);
    pump();
  });
  const app = AppState.addEventListener('change', state => {
    active = state === 'active';
    if (!active && currentUri) cancelRecordingReply(currentUri);
    else pump();
  });
  pump();
  return () => {
    stopped = true;
    unsubscribe();
    settings();
    app.remove();
    if (currentUri) cancelRecordingReply(currentUri);
  };
}
