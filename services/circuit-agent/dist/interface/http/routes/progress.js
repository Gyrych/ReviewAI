// 中文注释：进度查询路由；从依赖注入的 store 获取时间线
export function makeProgressHandler(store) {
    return async function progressHandler(req, res) {
        try {
            const id = String(req.params.id || '');
            const timeline = await store.get(id);
            res.json({ timeline });
        }
        catch (e) {
            res.status(500).json({ error: 'failed to read progress' });
        }
    };
}
