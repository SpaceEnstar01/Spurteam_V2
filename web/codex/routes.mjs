import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { mkdir, open, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { hasValidCreatorAgentBearer, validCreatorAgentToken } from '../creator-agent-auth.mjs'

const exec = promisify(execFile)
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const terminal = new Set(['finished', 'failed'])
const maxReportBytes = 1024 * 1024
const sessionKey = 'agent:main:spur-codex'
const ringInstructions = [
  '当前用户输入来自智能戒指的自然语音转写，可能有听写误差。',
  '结合专业术语和当前会话纠正可信的同音字、错别字和术语错误，例如在上下文支持时把「巨深智能」理解为「具身智能」。',
  '理解口语，过滤无意义的重复、语气词和停顿，保留否定、数字、任务范围与已明确的约束。',
  '结合上下文合理推断意图。意图明确就直接完成。存在重大歧义、无法可靠推断或可能产生严重错误时，只提出简短的确认问题，并将该问题作为本轮正文和成果文件内容。',
  '若输入只是麦克风测试、数数、无明确任务的杂音转写或口头片段，用一句话简短确认收到。不要搜索、分析或扩展成任务，仍将这句回复写入指定成果文件。若上下文表明这些数字或词语是实际任务的数据，则按任务处理。',
  '意图明确时完整呈现执行结果。'
].join('\n')

function view(task, detail = false) {
  const { id, message, status, phase, createdAt, startedAt, completedAt, summary, error, threadId } = task
  return { id, message, status, createdAt, startedAt, completedAt, summary, error, phase,
    title: message.slice(0, 42), threadId, hasReport: status === 'finished',
    ...(detail ? { reply: task.reply, logs: task.logs.filter(line => line !== 'OpenClaw 已接单') } : {}) }
}

export function createCodexRoutes({ config, runtimeRoot, cli, json, readJson }) {
  const workspace = config.SPUR_CODEX_WORKSPACE
  const gateway = config.SPUR_CODEX_GATEWAY_URL
  const gatewayConfig = config.SPUR_CODEX_GATEWAY_CONFIG
  const gatewayState = config.SPUR_CODEX_GATEWAY_STATE
  const enabled = Boolean(workspace && gateway && gatewayConfig && gatewayState)
  const root = join(runtimeRoot, 'codex')
  const tasks = new Map()
  let active = false
  let healthy = false
  let checkedAt = 0
  let checking
  const rpc = async (method, params, timeout = 6000) => {
    const { stdout } = await exec(process.execPath, [
      cli, 'gateway', 'call', method, '--expect-url', gateway,
      '--json', '--timeout', String(timeout), '--params', JSON.stringify(params),
    ], {
      timeout: timeout + 6000, maxBuffer: 2 * maxReportBytes,
      env: { ...process.env, OPENCLAW_CONFIG_PATH: gatewayConfig, OPENCLAW_STATE_DIR: gatewayState },
    })
    return JSON.parse(stdout)
  }
  const save = async task => {
    const file = join(root, task.id + '.json')
    await writeFile(file + '.tmp', JSON.stringify(task), { mode: 0o600 })
    await rename(file + '.tmp', file)
  }
  const load = enabled ? (async () => {
    await mkdir(root, { recursive: true, mode: 0o700 })
    for (const name of await readdir(root)) {
      if (!name.endsWith('.json') || !uuid.test(name.slice(0, -5))) continue
      const task = JSON.parse(await readFile(join(root, name), 'utf8'))
      if (task.id === name.slice(0, -5)) tasks.set(task.id, task)
    }
  })() : Promise.resolve()
  load.catch(() => {})
  async function check() {
    if (!enabled) return false
    if (Date.now() - checkedAt < 8000) return healthy
    checking ??= rpc('health', {}).then(() => true, () => false).then(result => {
      healthy = result
      checkedAt = Date.now()
      return result
    }).finally(() => { checking = undefined })
    return checking
  }
  async function readReport(task) {
    const directory = await realpath(workspace)
    const file = join(directory, task.id + '.md')
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || !stat.size || stat.size > maxReportBytes) throw Error('Invalid report')
      const buffer = Buffer.alloc(stat.size)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      const text = buffer.subarray(0, bytesRead).toString('utf8')
      if (!text.trim()) throw Error('Empty report')
      return text
    } finally {
      await handle.close()
    }
  }
  async function run(task) {
    if (task.phase === 'queued') {
      task.phase = 'dispatching'
      task.dispatchAt = new Date().toISOString()
      await save(task)
      const accepted = await rpc('agent', {
        agentId: 'main', sessionKey, idempotencyKey: task.id,
        deliver: false, timeout: 420,
        message: `完成下面的用户任务。需要外部资料时实际联网核对。请在当前工作目录使用工具写入 ${task.id}.md，保存完整 Markdown 成果，并在最终回复中直接给出同一份完整正文。简单问题简洁回答，复杂任务按需呈现分析、结论、数据、表格和参考链接。只能写入指定成果文件，不修改其他文件。\n\n${task.source === 'ring' ? ringInstructions + '\n\n' : ''}用户任务：\n${task.message}`,
      }, 20000)
      if (accepted.runId !== task.id) throw Error('Unexpected run ID')
      task.phase = 'accepted'
      await save(task)
    }
    if (task.status === 'queued' && task.phase === 'accepted') {
      const { session } = await rpc('sessions.describe', { key: sessionKey }).catch(() => ({}))
      if (session?.hasActiveRun && session.agentRuntime?.id === 'codex' &&
          (!session.activeRunIds || session.activeRunIds.includes(task.id))) {
        task.status = 'running'
        task.logs.push('Codex 开始执行')
        await save(task)
      }
    }
    const wait = await rpc('agent.wait', { runId: task.id, timeoutMs: 5000 }, 10000)
    if (wait.startedAt && !task.startedAt) {
      task.startedAt = new Date(wait.startedAt).toISOString()
      if (task.status === 'queued') {
        task.status = 'running'
        task.logs.push('Codex 开始执行')
      }
      await save(task)
    }
    if (wait.status === 'timeout' && !wait.endedAt) {
      if (Date.now() - Date.parse(task.dispatchAt || task.createdAt) < 10 * 60 * 1000) return
      task.phase = 'recovery'
      task.error = '暂时无法确认任务终态，待执行端恢复后继续查询。'
      await save(task)
      return
    }
    if (wait.status !== 'ok') {
      task.status = 'failed'
      task.error = 'Codex 未能完成此任务。请检查执行端日志。'
    } else {
      const receipt = wait.terminalReceipt
      const match = /^codex-app-server:([^:]+):/.exec(receipt?.assistantTranscriptIdempotencyKey || '')
      if (!match || receipt.rerouted !== false) {
        task.status = 'failed'
        task.error = '执行端未返回可验证的原生 Codex 回执。'
      } else {
        task.threadId = match[1]
        task.reply = wait.terminalReply?.text || ''
        try {
          const report = await readReport(task)
          task.report = report
          task.summary = (task.reply || report).replace(/\s+/g, ' ').slice(0, 100)
          task.status = 'finished'
          task.logs.push('报告已生成')
        } catch {
          task.status = 'failed'
          task.error = 'Codex 已返回，但报告文件缺失或无法交付。'
        }
      }
    }
    task.phase = 'terminal'
    if (task.status === 'finished') delete task.error
    task.completedAt = new Date(wait.endedAt || Date.now()).toISOString()
    if (task.status === 'failed') task.logs.push('任务失败')
    await save(task)
  }
  async function tick() {
    if (active) return
    active = true
    try {
      await load
      const task = [...tasks.values()].filter(t => !terminal.has(t.status))
        .sort((a, b) => Number(a.phase === 'queued') - Number(b.phase === 'queued') ||
          a.createdAt.localeCompare(b.createdAt))[0]
      if (task && task.phase !== 'persisting' && await check()) {
        try { await run(task) } catch {
          if (task.phase === 'dispatching') {
            task.error = '接单结果待确认，系统正在查询原任务。'
            await save(task)
          }
        }
      }
    } catch {
      console.error('[codex] Unable to process task state')
    } finally {
      active = false
    }
  }
  if (enabled) setInterval(() => { void tick() }, 2000).unref()
  return async function handle(request, response, url) {
    const token = config.SPUR_CREATOR_AGENT_TOKEN
    if (!enabled || !validCreatorAgentToken(token)) return json(response, 503, { error: 'Codex 服务尚未配置。' })
    if (!hasValidCreatorAgentBearer(request, token)) return json(response, 401, { error: '访问凭据无效。' })
    try {
      await load
      const path = url.pathname.slice('/api/codex/'.length)
      if (request.method === 'GET' && path === 'status') {
        const gatewayReachable = await check()
        return json(response, 200, { gatewayReachable })
      }
      if (path === 'tasks' && request.method === 'GET') {
        const limit = 50
        const ordered = [...tasks.values()].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        const cursor = url.searchParams.get('after')
        const index = cursor ? ordered.findIndex(t => t.id === cursor) : -1
        if (cursor && index === -1) return json(response, 400, { error: '历史游标无效。' })
        const page = ordered.slice(index + 1, index + 1 + limit)
        return json(response, 200, { tasks: page.map(task => view(task)),
          nextCursor: ordered.length > index + 1 + limit ? page.at(-1).id : null })
      }
      if (path === 'tasks' && request.method === 'POST') {
        let body
        try { body = await readJson(request) } catch (error) {
          return json(response, error.status || 400, { error: '任务请求格式有误。' })
        }
        const id = body?.requestId
        const source = body?.source === 'ring' ? 'ring' : undefined
        const message = typeof body?.message === 'string' ? body.message.trim() : ''
        if (typeof id !== 'string' || !uuid.test(id) || !message || message.length > 12000) {
          return json(response, 400, { error: '请输入有效的指令和任务编号。' })
        }
        const previous = tasks.get(id)
        if (previous) {
          if (previous.message !== message || previous.source !== source) return json(response, 409, { error: '该任务编号已用于另一条指令。' })
          if (previous.phase === 'persisting') return json(response, 503, { error: '任务正在保存，请重试同一请求。' })
          return json(response, 200, view(previous))
        }
        if ([...tasks.values()].filter(task => !terminal.has(task.status)).length >= 10) {
          return json(response, 429, { error: '待处理任务过多。' })
        }
        const task = { id, message, source, phase: 'persisting', status: 'queued', createdAt: new Date().toISOString(), logs: ['Spur 已接收任务'] }
        tasks.set(id, task)
        try {
          await save({ ...task, phase: 'queued' })
        } catch (error) {
          tasks.delete(id)
          throw error
        }
        task.phase = 'queued'
        void tick()
        return json(response, 202, view(task))
      }
      const [collection, id, artifact, ...extra] = path.split('/')
      const task = collection === 'tasks' && tasks.get(id)
      if (request.method !== 'GET' || !task || extra.length) return json(response, 404, { error: '任务不存在。' })
      if (!artifact) return json(response, 200, view(task, true))
      if (artifact !== 'report' || task.status !== 'finished') return json(response, 404, { error: '报告尚不可用。' })
      const report = task.report || await readReport(task)
      response.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Disposition': 'attachment; filename="report.md"', 'X-Content-Type-Options': 'nosniff' })
      return response.end(report)
    } catch {
      return json(response, 503, { error: 'Codex 服务暂不可用。' })
    }
  }
}
