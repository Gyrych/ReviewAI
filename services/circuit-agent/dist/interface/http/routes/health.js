// 中文注释：健康检查路由处理
export function healthHandler(req, res) {
    res.json({ status: 'ok', service: 'circuit-agent', endpoint: 'health' });
}
