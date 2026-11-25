import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { hasValidCreatorAgentBearer, validCreatorAgentToken } from '../creator-agent-auth.mjs'

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const terminal = new Set(['finished', 'failed'])
const limit = 1024 ** 2

async function readResult(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 2 * limit) throw Error('Result exceeds wire limit')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks))
}

export function createCodexRelay({ config, runtimeRoot, json, readJson }) {
  const appToken = config.SPUR_CREATOR_AGENT_TOKEN
  const deviceToken = config.SPUR_CODEX_DEVICE_TOKEN
  if (!validCreatorAgentToken(appToken) || !validCreatorAgentToken(deviceToken) || appToken === deviceToken) {
    throw Error('Codex relay requires distinct App and device credentials')
  }
  const directory = join(runtimeRoot, 'codex-relay')
  const file = join(directory, 'queue.json')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  let tasks
  try { tasks = JSON.parse(readFileSync(file, 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error; tasks = [] }
  let lastSeen = 0
  let polling = false

  function update(next) {
    const state = tasks.some(task => task.id === next.id)
      ? tasks.map(task => task.id === next.id ? next : task)
      : [...tasks, next]
    writeFileSync(file + '.tmp', JSON.stringify(state), { mode: 0o600 })
    renameSync(file + '.tmp', file)
    tasks = state
  }

  function view({ report, ...task }, detail = false) {
    const { reply, logs, ...summary } = task
    return { ...summary, hasReport: Boolean(report), ...(detail ? { reply, logs } : {}) }
  }

  return async function handle(request, response, url) {
    const path = url.pathname.slice('/api/codex/'.length)
    const device = path.startsWith('device/')
    if (!hasValidCreatorAgentBearer(request, device ? deviceToken : appToken)) {
      return json(response, 401, { error: '访问凭据无效。' })
    }
    const method = request.method
    try {
      if (device) lastSeen = Date.now()
      if (path === 'device/claim' && method === 'POST') {
        if (polling) return json(response, 409, { error: '已有领取请求。' })
        polling = true
        try {
          for (let i = 0; i < 40 && !response.destroyed; i++) {
            const pending = tasks.find(task => !terminal.has(task.status))
            if (pending) {
              if (!pending.claimedAt) update({ ...pending, claimedAt: new Date().toISOString() })
              return json(response, 200, { task: { id: pending.id, message: pending.message, source: pending.source } })
            }
            await delay(500)
          }
          if (!response.destroyed) return json(response, 200, { task: null })
        } finally { polling = false }
        return
      }
      const [collection, id, action] = path.split('/')
      if (collection === 'device' && id === 'result' && method === 'POST') {
        const body = await readResult(request)
        const task = tasks.find(entry => entry.id === body.id)
        if (!task?.claimedAt) return json(response, 404, { error: '任务未领取。' })
        if (terminal.has(task.status)) return json(response, 200, { ok: true })
        if (!['queued', 'running', 'finished', 'failed'].includes(body.status) ||
          (body.status === 'finished' && (typeof body.report !== 'string' || !body.report.trim() ||
            Buffer.byteLength(body.report) > limit || !uuid.test(body.threadId || '')))) {
          return json(response, 400, { error: '执行回执不完整。' })
        }
        const bounded = (value, size) => typeof value === 'string' ? value.slice(0, size) : undefined
        update({ ...task, status: task.status === 'running' && body.status === 'queued' ? 'running' : body.status,
          startedAt: bounded(body.startedAt, 40), completedAt: bounded(body.completedAt, 40),
          threadId: bounded(body.threadId, 36), summary: bounded(body.summary, 200),
          reply: bounded(body.reply, 16000), error: bounded(body.error, 300),
          report: body.status === 'finished' ? body.report : undefined,
          logs: body.status === 'finished' ? ['报告已生成'] : [] })
        return json(response, 200, { ok: true })
      }
      if (path === 'status' && method === 'GET') {
        return json(response, 200, { gatewayReachable: Date.now() - lastSeen < 45000 })
      }
      if (path === 'tasks' && method === 'POST') {
        const body = await readJson(request)
        const source = body?.source === 'ring' ? 'ring' : undefined
        const message = typeof body.message === 'string' ? body.message.trim() : ''
        if (!uuid.test(body.requestId || '') || !message || message.length > 12000) {
          return json(response, 400, { error: '任务编号或指令无效。' })
        }
        const previous = tasks.find(task => task.id === body.requestId)
        if (previous) return json(response, previous.message === message && previous.source === source ? 200 : 409, view(previous))
        if (tasks.filter(task => !terminal.has(task.status)).length >= 10) {
          return json(response, 429, { error: '待处理任务过多。' })
        }
        const task = { id: body.requestId, message, source, title: message.slice(0, 42), status: 'queued', createdAt: new Date().toISOString() }
        update(task)
        return json(response, 202, view(task))
      }
      if (path === 'tasks' && method === 'GET') {
        const sorted = [...tasks].reverse()
        const after = url.searchParams.get('after')
        const index = after ? sorted.findIndex(task => task.id === after) : -1
        if (after && index < 0) return json(response, 400, { error: '历史游标无效。' })
        const page = sorted.slice(index + 1, index + 51)
        return json(response, 200, { tasks: page.map(task => view(task)), nextCursor: sorted.length > index + 51 ? page.at(-1).id : null })
      }
      const task = collection === 'tasks' && tasks.find(entry => entry.id === id)
      if (!task || method !== 'GET') return json(response, 404, { error: '任务不存在。' })
      if (!action) return json(response, 200, view(task, true))
      if (action !== 'report' || !task.report) return json(response, 404, { error: '报告尚不可用。' })
      response.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      return response.end(task.report)
    } catch (error) {
      return json(response, error.status || 503, { error: '任务服务暂不可用。' })
    }
  }
}
