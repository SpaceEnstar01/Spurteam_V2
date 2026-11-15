// Real Node HTTP → V2 DSH → save_document → authenticated artifact delivery.
// The model is a local deterministic fixture: no private configuration or paid API.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'

const v2 = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = mkdtempSync(join(tmpdir(), 'spur-v2-independent-'))
const home = join(output, 'home')
mkdirSync(home)
const token = randomBytes(32).toString('base64url')
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const document = '# V2 independent task\nGenerated through the real DSH tool loop.\n'
const oldRoots = ['agent', 'app', 'desktop'].map(name => join(dirname(v2), name))
const policy = '(version 1)(allow default)' + oldRoots.map(path => `(deny file-read* (subpath ${JSON.stringify(path)}))`).join('')
const sandbox = process.platform === 'darwin' && process.argv.includes('--deny-parent')
const wrap = args => sandbox ? ['/usr/bin/sandbox-exec', ['-p', policy, process.execPath, ...args]] : [process.execPath, args]
let app, log = '', calls = 0
const model = createServer(async (req, res) => {
  try {
    let raw = ''; for await (const part of req) raw += part
    const body = JSON.parse(raw); calls++
    const complete = body.messages?.some(message => message.role === 'tool')
    const delta = complete ? { role: 'assistant', content: '独立任务已完成。' } : {
      role: 'assistant', tool_calls: [{ index: 0, id: 'independent-save', type: 'function', function: {
        name: 'save_document', arguments: JSON.stringify({ filename: 'independent.md', content: document }),
      } }],
    }
    const base = { id: 'independence-test', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: body.model }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    for (const choice of [{ delta, finish_reason: null }, { delta: {}, finish_reason: complete ? 'stop' : 'tool_calls' }]) {
      res.write('data: ' + JSON.stringify({ ...base, choices: [{ index: 0, ...choice }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) + '\n\n')
    }
    res.end('data: [DONE]\n\n')
  } catch { res.writeHead(500); res.end('fixture failure') }
})
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  if (process.argv.includes('--deny-parent')) assert(sandbox, '--deny-parent requires macOS sandbox-exec')
  if (sandbox) {
    for (const root of oldRoots) {
      const [command, args] = wrap(['-e', 'require("node:fs").readdirSync(process.argv[1])', root])
      const probe = spawnSync(command, args, { encoding: 'utf8' })
      assert.notEqual(probe.status, 0, `Sandbox did not deny ${root}`)
      assert.match(probe.stderr, /EPERM|EACCES|Operation not permitted/)
    }
    console.log('PARENT_AGENT_APP_DESKTOP_READ_DENIED=true')
  }
  await listen(model)
  const reservation = createServer(); await listen(reservation)
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  const base = `http://127.0.0.1:${port}`
  const [command, args] = wrap([join(v2, 'web/server.mjs')])
  app = spawn(command, args, {
    cwd: v2,
    env: {
      PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: home,
      TMPDIR: output, LANG: 'en_US.UTF-8', HOST: '127.0.0.1', PORT: String(port),
      SPUR_CONFIG_FILE: '/dev/null', SPUR_RUNTIME_ROOT: join(output, 'runtime'),
      SPUR_NODE_BIN: process.execPath, SPUR_CREATOR_AGENT_TOKEN: token,
      SILICONFLOW_API_KEY: 'local-fixture-only', SILICONFLOW_BASE_URL: `http://127.0.0.1:${model.address().port}/v1`,
      SPUR_AGENTMAIL_AUTOSUMMARY: '0', SPUR_RESEARCH_ADAPTER_ENABLED: '0', SPUR_OPENMONTAGE_ENABLED: '0',
      DSH_TELEMETRY_DISABLED: '1', NO_PROXY: '127.0.0.1,localhost',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  app.stdout.on('data', data => { log += data }); app.stderr.on('data', data => { log += data })
  app.on('error', error => { log += error.stack })
  let ready = false
  for (let i = 0; i < 90; i++) {
    if (app.exitCode !== null) throw Error('Server exited: ' + log)
    try { const response = await fetch(base + '/api/creator-agent/health', { headers, signal: AbortSignal.timeout(1000) }); ready = response.ok } catch {}
    if (ready) break
    await pause(300)
  }
  assert(ready, 'V2 server not ready: ' + log)
  assert.equal((await fetch(base + '/api/creator-agent/health')).status, 401)
  const profile = async () => {
    const response = await fetch(base + '/api/creator-agent/connections/profile', { method: 'POST', headers })
    assert.equal(response.status, 201); return (await response.json()).credential
  }
  const owner = { ...headers, 'X-Spur-Connection': await profile() }
  const other = { ...headers, 'X-Spur-Connection': await profile() }
  const id = randomUUID()
  const submit = await fetch(base + '/api/creator-agent/chat', { method: 'POST', headers: owner,
    body: JSON.stringify({ requestId: id, async: true, message: 'Call save_document to save independent.md, then finish.' }),
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(submit.status, 202, await submit.text())
  assert.equal((await fetch(base + '/api/creator-agent/tasks/' + id, { headers: other })).status, 404)
  let task
  for (let i = 0; i < 240; i++) {
    const response = await fetch(base + '/api/creator-agent/tasks/' + id, { headers: owner })
    assert.equal(response.status, 200); task = await response.json()
    if (['finished', 'failed'].includes(task.status)) break
    await pause(500)
  }
  assert.equal(task.status, 'finished', JSON.stringify(task))
  assert(calls >= 2, 'Model/tool-result round trip not observed')
  const result = JSON.parse(readFileSync(join(output, 'runtime/runs', id, 'result.json'), 'utf8'))
  assert(result.artifacts?.length, JSON.stringify(result))
  const download = await fetch(base + result.artifacts[0].url, { headers: owner })
  assert.equal(download.status, 200); assert.equal(await download.text(), document)
  const patch = JSON.parse(readFileSync(join(output, 'runtime/runs', id, 'harness.patch.json'), 'utf8'))
  for (const item of patch.flatMap(entry => entry.insert || [])) assert(item.name.startsWith(v2 + '/'), item.name)
  writeFileSync(join(output, 'verification.json'), JSON.stringify({ passed: true, parentReadsDenied: sandbox, v2, model: 'local deterministic fixture', modelCalls: calls, taskId: id, checks: ['health', 'anonymous denied', 'async submit', 'other profile denied', 'DSH tool loop', 'artifact bytes', 'V2 plugin paths'] }, null, 2))
  console.log(`V2_INDEPENDENT_AGENT_PASS model_calls=${calls}`)
} catch (error) {
  console.error(error.stack); process.exitCode = 1
} finally {
  writeFileSync(join(output, 'server.log'), log)
  if (app && app.exitCode === null) {
    const exited = once(app, 'exit'); app.kill('SIGTERM')
    await Promise.race([exited, pause(5000)]); if (app.exitCode === null) app.kill('SIGKILL')
  }
  model.closeAllConnections(); await new Promise(resolve => model.close(resolve))
  console.log('VERIFICATION_DIRECTORY=' + output)
}
