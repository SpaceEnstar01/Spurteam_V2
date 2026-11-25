import { setTimeout as delay } from 'node:timers/promises'
import { readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'

const { SPUR_CODEX_RELAY_URL, SPUR_CODEX_DEVICE_TOKEN_FILE, SPUR_CODEX_LOCAL_URL, SPUR_CODEX_LOCAL_TOKEN_FILE } = process.env
const openDesktop = process.platform === 'darwin' && process.env.SPUR_CODEX_OPEN_DESKTOP === '1'
const threadIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const cloud = new URL(SPUR_CODEX_RELAY_URL)
const local = new URL(SPUR_CODEX_LOCAL_URL)
if (cloud.protocol !== 'https:' || cloud.username || cloud.password ||
    local.origin !== `http://127.0.0.1:${local.port}`) {
  throw Error('Use an HTTPS relay and a loopback HTTP executor')
}
const cloudToken = readFileSync(SPUR_CODEX_DEVICE_TOKEN_FILE, 'utf8').trim()
const localToken = readFileSync(SPUR_CODEX_LOCAL_TOKEN_FILE, 'utf8').trim()

async function call(origin, token, path, body) {
  const response = await fetch(new URL('/api/codex/' + path, origin), {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body && JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw Error(`${path}: HTTP ${response.status}`)
  return path.endsWith('/report') ? response.text() : response.json()
}
const relay = (path, body) => call(cloud, cloudToken, path, body)
const executor = (path, body) => call(local, localToken, path, body)
for (;;) {
  try {
    const { gatewayReachable } = await executor('status')
    if (!gatewayReachable) throw Error('Local execution service offline')
    const { task } = await relay('device/claim', {})
    if (!task) continue
    await executor('tasks', { requestId: task.id, message: task.message, source: task.source })
    const result = await executor('tasks/' + task.id)
    if (result.status === 'finished') result.report = await executor('tasks/' + task.id + '/report')
    await relay('device/result', result)
    if (openDesktop && result.status === 'finished' && threadIdPattern.test(result.threadId)) {
      execFile('/usr/bin/open', ['-g', 'codex://threads/' + result.threadId], { timeout: 10000 }, error => {
        if (error) console.error('[codex worker] Could not open the Codex desktop thread', error.code)
      })
    }
    await delay(2000)
  } catch (error) {
    console.error('[codex worker]', error.message)
    await delay(5000)
  }
}
