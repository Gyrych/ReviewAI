"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSIONS_DIR = void 0;
exports.ensureSessionsDir = ensureSessionsDir;
exports.sanitizeId = sanitizeId;
exports.generateSessionFilename = generateSessionFilename;
exports.saveSession = saveSession;
exports.listSessions = listSessions;
exports.loadSession = loadSession;
exports.deleteSession = deleteSession;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.SESSIONS_DIR = path_1.default.join(__dirname, '..', 'sessions');
// 中文注释：确保会话目录存在
function ensureSessionsDir() {
    try {
        if (!fs_1.default.existsSync(exports.SESSIONS_DIR))
            fs_1.default.mkdirSync(exports.SESSIONS_DIR, { recursive: true });
    }
    catch (e) {
        // 忽略目录创建异常，交由上游报错
    }
}
// 中文注释：简单的 id 校验，防止路径穿越
function sanitizeId(id) {
    return (id || '').replace(/[^a-zA-Z0-9._-]/g, '');
}
// 中文注释：格式化日期为 YYYY-MM-DDTHH-mm-ss-SSS（避免 Windows 上的冒号）
function formatDateForFilename(d) {
    const pad = (n, w = 2) => n.toString().padStart(w, '0');
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    const ms = pad(d.getMilliseconds(), 3);
    return `${y}-${m}-${day}T${hh}-${mm}-${ss}-${ms}`;
}
// 中文注释：基于当天已有文件数量计算 4 位当日流水号
function nextSequenceForDate(d) {
    try {
        const prefix = `session_${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
        const files = fs_1.default.readdirSync(exports.SESSIONS_DIR).filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
        return files.length + 1;
    }
    catch (e) {
        return 1;
    }
}
// 中文注释：随机 4 位十六进制后缀
function randomSuffix() {
    return Math.floor(Math.random() * 0xffff)
        .toString(16)
        .padStart(4, '0');
}
// 中文注释：生成会话文件名（含当日流水号与随机后缀）
function generateSessionFilename(now = new Date()) {
    const ts = formatDateForFilename(now);
    const seq = nextSequenceForDate(now).toString().padStart(4, '0');
    const rand = randomSuffix();
    const id = `session_${ts}_${seq}_${rand}`;
    const filename = `${id}.json`;
    const createdAt = now.toISOString();
    return { id, filename, createdAt };
}
// 中文注释：保存会话内容到文件
function saveSession(payload) {
    ensureSessionsDir();
    const meta = generateSessionFilename(new Date());
    const toSave = Object.assign({}, payload, {
        id: meta.id,
        version: 1,
        createdAt: meta.createdAt,
    });
    const full = path_1.default.join(exports.SESSIONS_DIR, meta.filename);
    fs_1.default.writeFileSync(full, JSON.stringify(toSave, null, 2), { encoding: 'utf8' });
    return meta;
}
// 中文注释：列出最近的会话（倒序，最多 limit 条）
function listSessions(limit = 10) {
    ensureSessionsDir();
    const files = fs_1.default
        .readdirSync(exports.SESSIONS_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
        const full = path_1.default.join(exports.SESSIONS_DIR, f);
        const stat = fs_1.default.statSync(full);
        return { f, mtimeMs: stat.mtimeMs };
    })
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, Math.max(1, Math.min(100, limit)));
    const items = [];
    for (const it of files) {
        try {
            const full = path_1.default.join(exports.SESSIONS_DIR, it.f);
            const raw = fs_1.default.readFileSync(full, 'utf8');
            const j = JSON.parse(raw);
            const apiUrl = j.apiUrl || '';
            let apiHost;
            try {
                const u = new URL(apiUrl);
                apiHost = u.origin;
            }
            catch (e) {
                apiHost = apiUrl;
            }
            const createdAt = j.createdAt || new Date(it.mtimeMs).toISOString();
            const id = path_1.default.basename(it.f, '.json');
            const hasFiles = Array.isArray(j.files) && j.files.length > 0;
            items.push({ id, filename: it.f, createdAt, apiHost, model: j.customModelName || j.model, hasFiles });
        }
        catch (e) {
            // 忽略单个文件解析错误
        }
    }
    return items;
}
// 中文注释：加载单个会话
function loadSession(id) {
    ensureSessionsDir();
    const safe = sanitizeId(id);
    const full = path_1.default.join(exports.SESSIONS_DIR, `${safe}.json`);
    if (!fs_1.default.existsSync(full))
        throw new Error('session not found');
    const raw = fs_1.default.readFileSync(full, 'utf8');
    const j = JSON.parse(raw);
    return j;
}
// 中文注释：删除单个会话
function deleteSession(id) {
    ensureSessionsDir();
    const safe = sanitizeId(id);
    const full = path_1.default.join(exports.SESSIONS_DIR, `${safe}.json`);
    if (!fs_1.default.existsSync(full))
        return;
    fs_1.default.unlinkSync(full);
}
