// Detect parent-repository source dependencies without reading env/session files.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const v2 = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = dirname(v2)
const oldRoots = ['agent', 'app', 'desktop'].map(name => join(repo, name))
const inside = (path, root) => path === root || path.startsWith(root + sep)
const failures = []
let sourceFiles = 0, links = 0
const excluded = new Set(['node_modules', 'Pods', 'build', 'dist', '.runtime', '.git', '.build', '__pycache__', 'output'])
const extensions = new Set(['.mjs', '.cjs', '.js', '.ts', '.tsx', '.py', '.sh', '.json', '.yml', '.yaml'])
const areas = ['web', 'scripts', 'agent/tools', 'agent/integrations', 'agent/gateway', 'agent/deploy', 'agent/runtime/spur-profile', 'cloud/audio-agent/src', 'appV2/app_mobile/src']
function problem(file, reason) { failures.push({ file: relative(v2, file), reason }) }
function scan(folder, dependencies = false) {
  if (!existsSync(folder)) return
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isSymbolicLink()) {
      links++
      try { if (oldRoots.some(root => inside(realpathSync(path), root))) problem(path, 'symlink resolves into old root code') } catch { /* Optional platform links may be absent. */ }
    } else if (entry.isDirectory()) {
      if (dependencies || !excluded.has(entry.name)) scan(path, dependencies)
    } else if (!dependencies && extensions.has(extname(path)) && !/env|secret|credential|private/i.test(entry.name)) {
      sourceFiles++
      const source = readFileSync(path, 'utf8')
      if (oldRoots.some(root => source.includes(root))) problem(path, 'absolute old-root path')
      for (const match of source.matchAll(/(?:\bfrom\s*|\brequire\(\s*|\bimport\(\s*|\bimport\s*)['"]([^'"\n]+)['"]/g)) {
        const specifier = match[1]
        if (!specifier.startsWith('.') && !isAbsolute(specifier)) continue
        // ECS scripts embed imports at the Dockerfile's V2 installation path.
        const target = specifier.startsWith('/opt/spur/V2/')
          ? resolve(v2, specifier.slice('/opt/spur/V2/'.length))
          : resolve(dirname(path), specifier)
        if (!inside(target, v2)) problem(path, `import escapes V2: ${specifier}`)
        else if (existsSync(target) && oldRoots.some(root => inside(realpathSync(target), root))) problem(path, `import resolves into old root code: ${specifier}`)
      }
      if (extname(path) === '.json' && entry.name === 'package.json') {
        for (const spec of source.matchAll(/['"](?:file:|link:)([^'"\n]+)['"]/g)) {
          if (!inside(resolve(dirname(path), spec[1]), v2)) problem(path, 'file/link package dependency escapes V2')
        }
      }
    }
  }
}
for (const area of areas) scan(join(v2, area))
// Check installed graphs separately; don't follow links or read package contents.
for (const area of ['agent/runtime/deepseek-harness', 'agent/runtime/mcp-servers/playwright-mcp', 'web/node_modules', 'appV2/app_mobile/node_modules']) scan(join(v2, area), true)
for (const name of ['Dockerfile', 'OpenMontage.Dockerfile']) {
  const path = join(v2, 'agent/deploy/docker', name)
  if (/^\s*(?:COPY|ADD)\s+(?:--\S+\s+)*\.\.\//m.test(readFileSync(path, 'utf8'))) problem(path, 'Docker COPY/ADD escapes build context')
}
for (const path of ['web/server.mjs', 'agent/integrations/creator-research/run.mjs']) {
  const source = readFileSync(join(v2, path), 'utf8')
  if (/repoRoot|resolve\(root,\s*['"]\.\.\/agent\/runtime/.test(source)) problem(join(v2, path), 'parent Harness fallback reintroduced')
}
console.log(JSON.stringify({ v2, sourceFiles, links, failures }, null, 2))
if (failures.length) process.exitCode = 1
