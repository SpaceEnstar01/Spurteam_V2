import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { AppState } from 'react-native';
import { recordingKey } from '../ring/recordingIdentity';
import { useRecordingStore } from '../ring/store/useRecordingStore';
import { useRingStore } from '../ring/store/useRingStore';
import { submitCodexTask } from './codexApi';
import { newCreatorAgentRequestId } from './creatorAgentApi';

export const useRingCodexSettings = create<{
  base: string | null;
  error: string;
  setBase: (base: string | null) => void;
  setError: (error: string) => void;
}>()(
  persist(
    set => ({
      base: null,
      error: '',
      setBase: base => set({ base, error: '' }),
      setError: error => set({ error }),
    }),
    {
      name: 'spur-ring-codex-settings-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({ base: state.base }),
    },
  ),
);

export function watchRingCodex(
  base: string,
  onError: (message: string) => void,
) {
  const enabledAt = Date.now();
  const seen = new Set(
    useRecordingStore.getState().files.map(file => recordingKey(file.uri)),
  );
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sending = false;
  let pending: { key: string; id: string; message: string } | undefined;

  function schedule(wait = 0) {
    if (timer || sending || controller.signal.aborted) return;
    timer = setTimeout(() => {
      timer = undefined;
      void sendNext();
    }, wait);
  }

  async function sendNext() {
    if (
      controller.signal.aborted ||
      AppState.currentState !== 'active' ||
      useRingStore.getState().status !== 'connected'
    )
      return;

    if (!pending) {
      const file = useRecordingStore
        .getState()
        .files.filter(
          item =>
            item.source === 'ring' &&
            (item.commandRecordedAt ?? 0) > enabledAt &&
            item.recognitionState === 'done' &&
            item.transcript?.trim() &&
            !seen.has(recordingKey(item.uri)),
        )
        .sort(
          (a, b) => (a.commandRecordedAt ?? 0) - (b.commandRecordedAt ?? 0),
        )[0];
      if (!file?.transcript) return;
      pending = {
        key: recordingKey(file.uri),
        id: newCreatorAgentRequestId(),
        message: file.transcript,
      };
    }

    const task = pending;
    sending = true;
    let wait = 0;
    try {
      await submitCodexTask(task.message, task.id, 'ring', {
        base,
        signal: controller.signal,
      });
      seen.add(task.key);
      pending = undefined;
      if (!controller.signal.aborted) onError('');
    } catch (failure) {
      wait = 15000;
      if (!controller.signal.aborted) {
        onError(
          failure instanceof Error
            ? failure.message
            : '戒指转写提交失败，稍后重试。',
        );
      }
    } finally {
      sending = false;
      schedule(wait);
    }
  }

  const recordings = useRecordingStore.subscribe((state, previous) => {
    if (state.files !== previous.files) schedule();
  });
  const ring = useRingStore.subscribe((state, previous) => {
    if (state.status === 'connected' && previous.status !== 'connected')
      schedule();
  });
  const lifecycle = AppState.addEventListener('change', state => {
    if (state === 'active') schedule();
  });
  return () => {
    controller.abort();
    clearTimeout(timer);
    recordings();
    ring();
    lifecycle.remove();
  };
}
