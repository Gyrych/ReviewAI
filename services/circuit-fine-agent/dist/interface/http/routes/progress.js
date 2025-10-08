// 独立实现 makeProgressHandler，避免跨包相对导入导致模块解析错误
export function makeProgressHandler(store) {
    return async function progressHandler(req, res) {
        try {
            const id = String(req.params.id || '');
            const timeline = await store.get(id);
            res.json({ timeline });
        }
        catch (e) {
            res.status(500).json({ error: e?.message || 'failed to read progress' });
        }
    };
}
