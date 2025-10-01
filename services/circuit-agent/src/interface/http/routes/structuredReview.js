export function makeStructuredReviewHandler(usecase) {
    return async function handler(req, res) {
        try {
            const body = req.body || {};
            const apiUrl = String(body.apiUrl || '');
            const models = Array.isArray(body.models) ? body.models : (() => { try {
                return JSON.parse(body.models || '[]');
            }
            catch {
                return [];
            } })();
            const circuit = (() => { try {
                return typeof body.circuit === 'string' ? JSON.parse(body.circuit) : body.circuit;
            }
            catch {
                return { components: [], nets: [] };
            } })();
            const systemPrompt = String(body.systemPrompt || '');
            const requirements = String(body.requirements || '');
            const specs = String(body.specs || '');
            const dialog = String(body.dialog || '');
            const history = (() => { try {
                return body.history ? (typeof body.history === 'string' ? JSON.parse(body.history) : body.history) : [];
            }
            catch {
                return [];
            } })();
            if (!apiUrl || !models || models.length === 0)
                return res.status(400).json({ error: 'apiUrl and models required' });
            const authHeader = req.header('authorization') || undefined;
            const progressId = String(body.progressId || '') || undefined;
            const out = await usecase.execute({ apiUrl, models, circuit, systemPrompt, requirements, specs, dialog, history, authHeader, progressId });
            res.json(out);
        }
        catch (e) {
            res.status(502).json({ error: e?.message || 'upstream error' });
        }
    };
}
