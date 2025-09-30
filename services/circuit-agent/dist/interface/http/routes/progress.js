// 中文注释：进度查询路由；从依赖注入的 store 获取时间线
export function makeProgressHandler(store) {
    return async function progressHandler(req, res) {
        try {
            const id = String(req.params.id || '');
            const timeline = await store.get(id);
            // 如果请求 query 中包含 rawIndex，则返回该条目的完整 requestFull/responseFull
            const rawIndex = req.query.rawIndex !== undefined ? Number(req.query.rawIndex) : undefined;
            if (rawIndex !== undefined && !Number.isNaN(rawIndex)) {
                const entry = timeline[rawIndex];
                if (!entry)
                    return res.status(404).json({ error: 'entry not found' });
                return res.json({ entry: { step: entry.step, ts: entry.ts, origin: entry.origin, category: entry.category, requestFull: entry.requestFull, responseFull: entry.responseFull } });
            }
            res.json({ timeline });
        }
        catch (e) {
            res.status(500).json({ error: 'failed to read progress' });
        }
    };
}
