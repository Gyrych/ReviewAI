const { spawn } = require('child_process')
const path = require('path')

function run(name, cmd, args, cwd) {
  const p = spawn(cmd, args, { cwd, shell: true })
  p.stdout.on('data', (data) => process.stdout.write(`[${name}] ${data.toString()}`))
  p.stderr.on('data', (data) => process.stderr.write(`[${name}] ${data.toString()}`))
  p.on('close', (code) => console.log(`[${name}] exited with code ${code}`))
  return p
}

const circuitAgent = run('circuit-agent', 'npm', ['run', 'dev'], path.join(__dirname, 'services', 'circuit-agent'))
const frontend = run('frontend', 'npm', ['run', 'dev'], path.join(__dirname, 'frontend'))

function shutdown() {
  console.log('Shutting down processes...')
  try { circuitAgent.kill() } catch (e) {}
  try { frontend.kill() } catch (e) {}
  process.exit()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)


