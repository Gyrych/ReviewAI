import fs from 'fs';
import path from 'path';
// 中文注释：会话存储（隔离目录），JSON 文件序列化
export class SessionStoreFs {
    constructor(rootDir) {
        this.rootDir = rootDir;
    }
    ensureDir(p) { if (!fs.existsSync(p))
        fs.mkdirSync(p, { recursive: true }); }
    nowName() {
        const d = new Date();
        const pad = (n, w = 2) => String(n).padStart(w, '0');
        const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`;
        const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
        return `session_${ts}_${rand}.json`;
    }
    async save(payload) {
        const dir = path.join(this.rootDir, 'sessions');
        this.ensureDir(dir);
        const filename = this.nowName();
        const full = path.join(dir, filename);
        fs.writeFileSync(full, JSON.stringify(payload, null, 2), { encoding: 'utf8' });
        const id = path.basename(filename, '.json');
        return { id };
    }
    async load(id) {
        const dir = path.join(this.rootDir, 'sessions');
        const safe = String(id || '').replace(/[^a-zA-Z0-9._-]/g, '');
        const full = path.join(dir, `${safe}.json`);
        if (!fs.existsSync(full))
            throw new Error('session not found');
        const raw = fs.readFileSync(full, 'utf8');
        return JSON.parse(raw);
    }
    async list(limit) {
        const dir = path.join(this.rootDir, 'sessions');
        this.ensureDir(dir);
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime).slice(0, Math.max(1, Math.min(100, limit || 10)));
        return files.map(x => ({ id: path.basename(x.f, '.json'), filename: x.f }));
    }
    async remove(id) {
        const dir = path.join(this.rootDir, 'sessions');
        const safe = String(id || '').replace(/[^a-zA-Z0-9._-]/g, '');
        const full = path.join(dir, `${safe}.json`);
        if (fs.existsSync(full))
            fs.unlinkSync(full);
    }
}
