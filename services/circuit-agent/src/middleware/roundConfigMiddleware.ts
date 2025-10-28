import { validateRoundConfig } from '../validators/roundConfigValidator'
import { RoundConfigDefaults } from '../config/defaults'

export function roundConfigMiddleware(req: any, res: any, next: any) {
  try {
    const cfg = (req.body && req.body.options) ? { ...RoundConfigDefaults, ...(req.body.options || {}) } : { ...RoundConfigDefaults, ...(req.body || {}) }
    const v = validateRoundConfig(cfg)
    if (!v.valid) return res.status(400).json({ error: 'invalid_round_config', details: v.errors })
    // 将合并后的 cfg 回写到 req._roundConfig 供下游使用
    req._roundConfig = cfg
    next()
  } catch (e) { next() }
}

export default roundConfigMiddleware


