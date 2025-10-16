from typing import List, Dict, Optional
from app.utils.prompt_loader import PromptLoader, PromptLoadError
from app.infra.http.openrouter_client import post_json
from app.infra.providers.text import OpenRouterTextProvider
from app.core.config import get_config

class OpenRouterSearch:
    def __init__(self, base_url: str, default_timeout_ms: int, headers: Optional[Dict[str,str]]=None, options: Optional[Dict]=None):
        self.provider = OpenRouterTextProvider(base_url, default_timeout_ms)
        configured = (options or {}).get('modelOverride') or ''
        fallback = 'perplexity/sonar'
        raw = configured or fallback
        force_online = (options or {}).get('forceOnline', False)
        needs_online = force_online and 'perplexity/' not in raw and not raw.endswith(':online')
        self.model = raw + (':online' if needs_online else '')
        self.headers = headers

    async def search(self, query: str, top_n: int) -> List[Dict[str,str]]:
        try:
            psearch = PromptLoader.load_prompt('circuit-agent', 'pass', 'zh', 'search')
            system = str(psearch).replace('{topN}', str(top_n))
        except PromptLoadError:
            system = ''
        user_msg = query
        plugins = [{ 'id': 'web', 'engine': 'exa', 'max_results': max(1, int(top_n or 5)) }]
        resp = await self.provider.chat('', self.model, system, [{ 'role': 'user', 'content': user_msg }], plugins=plugins, headers=self.headers)
        txt = (resp.get('text') or '').strip()
        if not txt:
            return []
        import json
        try:
            j = json.loads(txt)
            if isinstance(j, list):
                out = []
                for it in j[:top_n]:
                    title = str(it.get('title') or it.get('name') or '').strip()
                    url = str(it.get('url') or it.get('link') or '').strip()
                    if title and url:
                        out.append({'title': title, 'url': url})
                return out
        except Exception:
            pass
        lines = [l.strip() for l in txt.splitlines() if l.strip()]
        results = []
        for l in lines:
            if len(results) >= top_n:
                break
            import re
            m = re.search(r"(https?://[^\s,;]+)", l)
            if m:
                url = m.group(1)
                title = l.replace(url, '').replace('-', ' ').strip() or url
                results.append({'title': title, 'url': url})
        return results[:top_n]

    async def summarize_url(self, url: str, word_limit: int, lang: str) -> str:
        try:
            psummary = PromptLoader.load_prompt('circuit-agent', 'pass', 'zh', 'summary')
            system = str(psummary).replace('{limit}', str(max(64, min(2048, int(word_limit or 1024))))).replace('{lang}', 'Chinese' if lang == 'zh' else 'English')
        except PromptLoadError:
            system = ''
        user_msg = f"URL: {url}"
        model_name = 'qwen/qwen2.5-vl-72b-instruct:free'
        plugins = [{ 'id': 'web', 'engine': 'exa', 'max_results': int(1) }]
        resp = await self.provider.chat('', model_name, system, [{ 'role': 'user', 'content': user_msg }], plugins=plugins, headers=self.headers)
        txt = (resp.get('text') or '').strip()
        return txt
