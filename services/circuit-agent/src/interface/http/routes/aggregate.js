// 中文注释：aggregate 路由用于接收多个模型/阶段的整合请求，并返回最终整合结果或状态。当前文件为路由占位。
import multer from 'multer';
import path from 'path';
import fs from 'fs';
export function makeAggregateRouter(deps) {
    const uploadDir = path.join(deps.storageRoot, 'tmp');
    try {
        if (!fs.existsSync(uploadDir))
            fs.mkdirSync(uploadDir, { recursive: true });
    }
    catch { }
    const upload = multer({ dest: uploadDir });
    const handler = async (req, res) => {
        try {
            const body = req.body || {};
            const apiUrl = String(body.apiUrl || '');
            const model = String(body.model || 'openai/gpt-5');
            const circuit = (() => { try {
                return typeof body.circuit === 'string' ? JSON.parse(body.circuit) : body.circuit;
            }
            catch {
                return { components: [], nets: [] };
            } })();
            const reports = (() => { try {
                return typeof body.reports === 'string' ? JSON.parse(body.reports) : body.reports;
            }
            catch {
                return [];
            } })();
            const systemPrompt = String(body.systemPrompt || '');
            const authHeader = req.header('authorization') || undefined;
            const progressId = String(body.progressId || '') || undefined;
            const filesField = req.files || [];
            const attachments = filesField.map((f) => ({ name: f.originalname || f.filename, mime: f.mimetype || 'application/octet-stream', text: (() => { try {
                    const buf = fs.readFileSync(f.path);
                    return buf.toString('utf8');
                }
                catch {
                    return '';
                } })() }));
            const out = await deps.usecase.execute({ apiUrl, model, circuit, reports, systemPrompt, attachments, authHeader, progressId });
            res.json(out);
        }
        catch (e) {
            res.status(502).json({ error: e?.message || 'upstream error' });
        }
        finally {
            try {
                const filesField = req.files || [];
                filesField.forEach((f) => { try {
                    fs.unlinkSync(f.path);
                }
                catch { } });
            }
            catch { }
        }
    };
    return { upload, handler };
}
