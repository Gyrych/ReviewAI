#!/usr/bin/env node
// 目的：对比 OpenAPI 契约与 Express 路由实现；不一致时以非 0 退出
// 依赖：node >= 18；若无 yaml 依赖，则采取简化路径（尝试解析 YAML，失败则退出）

import fs from 'fs'
import path from 'path'

let yaml
try { yaml = (await import('yaml')).default } catch { yaml = null }

const repoRoot = process.cwd()
const openapiPath = path.join(repoRoot, 'specs', '004-audit-constitution', 'contracts', 'openapi.yaml')
const routesDir = path.join(repoRoot, 'services', 'circuit-agent', 'src', 'interface', 'http', 'routes')
const bootstrapServer = path.join(repoRoot, 'services', 'circuit-agent', 'src', 'bootstrap', 'server.ts')
const BASE_PATH_VALUE = '/api/v1/circuit-agent'

function readOpenapiPaths() {
  const text = fs.readFileSync(openapiPath, 'utf8')
  if (!yaml) {
    console.error('[check-contract] 缺少 yaml 依赖，无法解析 openapi.yaml，请安装依赖或使用 JSON 版本')
    process.exit(7)
  }
  const doc = yaml.parse(text)
  const result = new Set()
  for (const p of Object.keys(doc.paths || {})) {
    const methods = Object.keys(doc.paths[p] || {})
    for (const m of methods) result.add(`${m.toUpperCase()} ${p}`)
  }
  return result
}

function readImplementedRoutes() {
  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts'))
  if (fs.existsSync(bootstrapServer)) files.push('@@BOOTSTRAP@@')
  const result = new Set()
  const re = /(router|app)\.(get|post|put|delete)\s*\(\s*[`'"]([^`'\"]+)[`'\"]/gi
  for (const f of files) {
    const code = (f === '@@BOOTSTRAP@@')
      ? fs.readFileSync(bootstrapServer, 'utf8')
      : fs.readFileSync(path.join(routesDir, f), 'utf8')
    let m
    while ((m = re.exec(code))) {
      const method = m[2].toUpperCase()
      const rawRoute = m[3]
      const route = String(rawRoute).replace(/\$\{BASE_PATH\}/g, BASE_PATH_VALUE)
      result.add(`${method} ${route}`)
    }
  }
  return result
}

const specSet = readOpenapiPaths()
const implSet = readImplementedRoutes()

const missingInImpl = [...specSet].filter(x => !implSet.has(x))
const extraInImpl = [...implSet].filter(x => !specSet.has(x))

if (missingInImpl.length) {
  console.error('[check-contract] 契约一致性检查失败（实现缺少契约定义的端点）')
  console.error('实现缺少（应实现但未实现):\n - ' + missingInImpl.join('\n - '))
  if (extraInImpl.length) console.warn('提示：实现中存在契约未声明的端点（仅警告，不阻断）:\n - ' + extraInImpl.join('\n - '))
  process.exit(7)
}

if (extraInImpl.length) {
  console.warn('[check-contract] 警告：实现中存在契约未声明的端点（仅警告，不阻断）')
  console.warn(' - ' + extraInImpl.join('\n - '))
}

console.log('[check-contract] 契约一致性检查通过（所有契约端点均已实现）')
process.exit(0)


