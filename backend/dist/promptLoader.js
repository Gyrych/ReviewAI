"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPrompt = loadPrompt;
exports.renderTemplate = renderTemplate;
exports.normalizeLang = normalizeLang;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const PROMPT_DIR = path_1.default.resolve(__dirname, '..', '..', 'schematic-ai-review-prompt');
const CACHE = {};
function resolveFilename(lang, name) {
    const fname = lang === 'en' ? `${name}.md` : `${name}.md`;
    // 支持中文文件名（如果 name 为 SystemPrompt，则中文文件为 系统提示词.md）
    if (lang === 'zh') {
        if (name === 'SystemPrompt')
            return '系统提示词.md';
        if (name === 'ParserSystem')
            return '解析器系统提示.md';
        if (name === 'Consolidation')
            return '整合提示.md';
    }
    return fname;
}
async function loadPrompt(lang, name, opts) {
    const filename = resolveFilename(lang, name);
    const fullPath = path_1.default.join(PROMPT_DIR, filename);
    const cacheKey = `${lang}:${name}:${fullPath}`;
    if (!opts?.disableCache && CACHE[cacheKey]) {
        return CACHE[cacheKey].text;
    }
    // 回退路径：仓库根目录下也可能存在 prompt 文件
    const fallbackPath = path_1.default.resolve(process.cwd(), filename);
    let p = fullPath;
    if (!fs_1.default.existsSync(p)) {
        if (fs_1.default.existsSync(fallbackPath))
            p = fallbackPath;
        else
            throw new Error(`prompt file not found: ${filename}`);
    }
    const txt = fs_1.default.readFileSync(p, { encoding: 'utf8' });
    CACHE[cacheKey] = { text: txt, ts: Date.now() };
    return txt;
}
function renderTemplate(template, vars) {
    if (!vars)
        return template;
    return template.replace(/{{\s*([a-zA-Z0-9_\.]+)\s*}}/g, (m, key) => {
        const parts = key.split('.');
        let v = vars;
        for (const p of parts) {
            if (v && Object.prototype.hasOwnProperty.call(v, p))
                v = v[p];
            else
                return '';
        }
        return typeof v === 'string' ? v : JSON.stringify(v);
    });
}
// 导出帮助函数：用于检测语言优先级
function normalizeLang(lang) {
    if (!lang)
        return 'zh';
    const l = String(lang).toLowerCase();
    if (l === 'en' || l === 'english')
        return 'en';
    return 'zh';
}
exports.default = { loadPrompt, renderTemplate, normalizeLang };
