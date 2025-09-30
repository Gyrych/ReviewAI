const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

// 服务列表：name, cwd, start command (array)
const services = [
  { name: 'circuit-agent', cwd: path.join(__dirname, 'services', 'circuit-agent'), start: ['npm', 'run', 'dev'] },
  { name: 'circuit-fine-agent', cwd: path.join(__dirname, 'services', 'circuit-fine-agent'), start: ['npm', 'run', 'dev'] },
  { name: 'frontend', cwd: path.join(__dirname, 'frontend'), start: ['npm', 'run', 'dev'] },
]

function run(name, cmd, args, cwd) {
  const p = spawn(cmd, args, { cwd, shell: true })
  p.stdout.on('data', (data) => process.stdout.write(`[${name}] ${data.toString()}`))
  p.stderr.on('data', (data) => process.stderr.write(`[${name}] ${data.toString()}`))
  p.on('close', (code) => console.log(`[${name}] exited with code ${code}`))
  return p
}

function hasNodeAndNpm() {
  try {
    const v = spawn('node', ['-v'], { shell: true, stdio: 'ignore' })
    const n = spawn('npm', ['-v'], { shell: true, stdio: 'ignore' })
    return true
  } catch (e) {
    return false
  }
}

function checkInstalledDeps(cwd) {
  try {
    const pkgPath = path.join(cwd, 'package.json')
    if (!fs.existsSync(pkgPath)) return false
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    const deps = Object.assign({}, pkg.dependencies || {}, pkg.peerDependencies || {})
    if (Object.keys(deps).length === 0) return true
    for (const dep of Object.keys(deps)) {
      const depPkg = path.join(cwd, 'node_modules', dep, 'package.json')
      if (!fs.existsSync(depPkg)) return false
    }
    return true
  } catch (e) {
    return false
  }
}

function installWithRetry(name, cwd) {
  const maxAttempts = 2
  let attempt = 0
  return new Promise(async (resolve, reject) => {
    async function tryOnce() {
      attempt++
      const useCi = fs.existsSync(path.join(cwd, 'package-lock.json'))
      const cmd = useCi ? 'ci' : 'install'
      console.log(`[${name}] running npm ${cmd} (attempt ${attempt}/${maxAttempts})`)
      const p = spawn('npm', [cmd], { cwd, shell: true, stdio: 'inherit' })
      p.on('close', (code) => {
        if (code === 0) return resolve(true)
        if (attempt < maxAttempts) {
          console.log(`[${name}] npm ${cmd} failed, retrying...`)
          setTimeout(tryOnce, 2000)
        } else {
          return reject(new Error(`npm ${cmd} failed for ${name}`))
        }
      })
      p.on('error', (err) => {
        return reject(err)
      })
    }
    tryOnce()
  })
}

async function ensureDependenciesForService(svc) {
  const name = svc.name
  const cwd = svc.cwd
  if (process.env.SKIP_DEP_INSTALL === '1') {
    console.log(`[${name}] SKIP_DEP_INSTALL=1, skipping install checks`)
    return true
  }
  const alreadyInstalled = checkInstalledDeps(cwd)
  if (alreadyInstalled && process.env.FORCE_DEP_INSTALL !== '1') {
    console.log(`[${name}] dependencies appear installed`)
    return true
  }
  if (process.env.FORCE_DEP_INSTALL === '1' || !alreadyInstalled) {
    console.log(`[${name}] installing dependencies (force=${process.env.FORCE_DEP_INSTALL === '1'})`)
    return installWithRetry(name, cwd)
  }
  return true
}

async function startAll() {
  if (!hasNodeAndNpm()) {
    console.error('Node or npm not found in PATH. Please install Node.js and ensure npm is available.')
    process.exit(1)
  }

  const parallelInstall = process.env.PARALLEL_INSTALL === '1'
  try {
    if (parallelInstall) {
      await Promise.all(services.map((s) => ensureDependenciesForService(s)))
    } else {
      for (const svc of services) {
        try {
          await ensureDependenciesForService(svc)
        } catch (e) {
          console.error(`[${svc.name}] dependency install failed: ${e.message}`)
          if (process.env.CONTINUE_ON_INSTALL_FAIL === '1') {
            console.warn(`[${svc.name}] continuing despite install failure due to CONTINUE_ON_INSTALL_FAIL=1`)
          } else {
            console.error('Aborting startup due to install failure. Set CONTINUE_ON_INSTALL_FAIL=1 to override.')
            process.exit(1)
          }
        }
      }
    }
  } catch (e) {
    console.error('Dependency installation phase failed:', e)
    process.exit(1)
  }

  // 启动服务并转发输出
  const procs = services.map((svc) => run(svc.name, svc.start[0], svc.start.slice(1), svc.cwd))

  function shutdown() {
    console.log('Shutting down processes...')
    for (const p of procs) {
      try { p.kill() } catch (e) {}
    }
    process.exit()
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

startAll()
