const { spawn } = require('child_process')
const path = require('path')

function run(name, cmd, args, cwd) {
  const p = spawn(cmd, args, { cwd, shell: true })
  p.stdout.on('data', (data) => process.stdout.write(`[${name}] ${data.toString()}`))
  p.stderr.on('data', (data) => process.stderr.write(`[${name}] ${data.toString()}`))
  p.on('close', (code) => console.log(`[${name}] exited with code ${code}`))
  return p
}

function ensureDependencies(name, cwd) {
  // 如果 node_modules 缺失，运行 npm install
  const fs = require('fs')
  const nm = require('path').join(cwd, 'node_modules')
  if (!fs.existsSync(nm)) {
    console.log(`[${name}] node_modules not found, running npm install...`)
    const p = spawn('npm', ['install'], { cwd, shell: true, stdio: 'inherit' })
    return new Promise((resolve, reject) => {
      p.on('close', (code) => {
        if (code === 0) resolve(true)
        else reject(new Error('npm install failed'))
      })
    })
  }
  return Promise.resolve(true)
}

async function startAll() {
  try {
    await ensureDependencies('circuit-agent', path.join(__dirname, 'services', 'circuit-agent'))
  } catch (e) { console.warn('[circuit-agent] npm install failed or skipped') }
  try {
    await ensureDependencies('circuit-fine-agent', path.join(__dirname, 'services', 'circuit-fine-agent'))
  } catch (e) { console.warn('[circuit-fine-agent] npm install failed or skipped') }
  try {
    await ensureDependencies('frontend', path.join(__dirname, 'frontend'))
  } catch (e) { console.warn('[frontend] npm install failed or skipped') }

  const circuitAgent = run('circuit-agent', 'npm', ['run', 'dev'], path.join(__dirname, 'services', 'circuit-agent'))
  const circuitFineAgent = run('circuit-fine-agent', 'npm', ['run', 'dev'], path.join(__dirname, 'services', 'circuit-fine-agent'))
  const frontend = run('frontend', 'npm', ['run', 'dev'], path.join(__dirname, 'frontend'))

  function shutdown() {
    console.log('Shutting down processes...')
    try { circuitAgent.kill() } catch (e) {}
    try { circuitFineAgent.kill() } catch (e) {}
    try { frontend.kill() } catch (e) {}
    process.exit()
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

startAll()

function shutdown() {
  console.log('Shutting down processes...')
  try { circuitAgent.kill() } catch (e) {}
  try { circuitFineAgent.kill() } catch (e) {}
  try { frontend.kill() } catch (e) {}
  process.exit()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)


