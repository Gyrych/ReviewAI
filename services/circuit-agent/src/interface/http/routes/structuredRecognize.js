import multer from 'multer';
import path from 'path';
import fs from 'fs';
export function makeStructuredRecognizeRouter(deps) {
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
            const visionModel = String(body.visionModel || 'openai/gpt-5-mini');
            if (!apiUrl || !visionModel)
                return res.status(400).json({ error: 'apiUrl and visionModel are required' });
            const progressId = String(body.progressId || '') || undefined;
            const enableSearch = String(body.enableSearch || 'false').toLowerCase() === 'true';
            const searchTopN = Number(body.searchTopN || 5);
            const filesField = req.files || [];
            if (!filesField || filesField.length === 0)
                return res.status(400).json({ error: 'images required' });
            const images = filesField.map(f => ({ name: f.originalname || f.filename, mime: f.mimetype || 'application/octet-stream', bytes: fs.readFileSync(f.path) }));
            const out = await deps.usecase.execute({ apiUrl, visionModel, images, enableSearch, searchTopN, progressId });
            res.json({ circuit: out.circuit, timeline: out.timeline });
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
