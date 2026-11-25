import { getCreatorAgentToken, getCreatorAgentUrl } from './creatorAgentApi';

export type CodexTask = {
  id: string;
  message: string;
  title: string;
  status: 'queued' | 'running' | 'finished' | 'failed';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  summary?: string;
  error?: string;
  threadId?: string;
  hasReport: boolean;
  reply?: string;
  logs?: string[];
};

async function request(
  path: string,
  body?: unknown,
  target?: { base: string; signal: AbortSignal },
) {
  const base = await getCreatorAgentUrl();
  if (target && target.base !== base)
    throw new Error('服务地址已更改，请重新开启戒指接入。');
  if (!base) throw new Error('请先在设置中配置 Personal Agent 服务地址。');
  if (!__DEV__ && !base.startsWith('https://')) {
    throw new Error('正式版本仅允许 HTTPS 服务。');
  }
  const token = await getCreatorAgentToken(base);
  if (!token) throw new Error('请先在设置中保存访问令牌。');
  const controller = new AbortController();
  const abort = () => controller.abort();
  target?.signal.addEventListener('abort', abort, { once: true });
  if (target?.signal.aborted) abort();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const result = await fetch(`${base}/api/codex/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!result.ok) {
      const data = await result.json().catch(() => null);
      throw new Error(data?.error || 'Codex 服务暂不可用。');
    }
    return path.endsWith('/report') ? await result.text() : await result.json();
  } finally {
    clearTimeout(timeout);
    target?.signal.removeEventListener('abort', abort);
  }
}

export function readCodexStatus(): Promise<{ gatewayReachable: boolean }> {
  return request('status');
}
export function listCodexTasks(
  after?: string,
): Promise<{ tasks: CodexTask[]; nextCursor: string | null }> {
  return request(after ? `tasks?after=${encodeURIComponent(after)}` : 'tasks');
}
export function submitCodexTask(
  message: string,
  requestId: string,
  source?: 'ring',
  target?: { base: string; signal: AbortSignal },
): Promise<CodexTask> {
  return request('tasks', { message, requestId, source }, target);
}
export function readCodexTask(id: string): Promise<CodexTask> {
  return request(`tasks/${encodeURIComponent(id)}`);
}
export function readCodexReport(id: string): Promise<string> {
  return request(`tasks/${encodeURIComponent(id)}/report`);
}
