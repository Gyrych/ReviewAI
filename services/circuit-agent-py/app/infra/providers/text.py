from typing import Any, Dict, List, Optional
from app.infra.http.openrouter_client import post_json, extract_text_from_openai_compat
from app.core.config import get_config

class OpenRouterTextProvider:
    def __init__(self, base_url: str, default_timeout_ms: int):
        self.base_url = base_url
        self.default_timeout_ms = default_timeout_ms

    async def chat(self, api_url: str, model: str, system: str, messages: List[Dict[str, Any]], plugins: Optional[List[Dict]]=None, headers: Optional[Dict[str,str]]=None) -> Dict[str,Any]:
        # 构建 body 与调用 openrouter client
        body = {
            'model': model,
            'system': system,
            'messages': messages,
        }
        if plugins:
            body['plugins'] = plugins
        # 使用 post_json 发起请求（若 base_url 为空，则返回 mock）
        if not self.base_url:
            # mock behavior: return newline-separated lines with url
            text = '\n'.join([f"{i+1}. Example Title - https://example.com/{i+1}" for i in range(min(5, len(messages)))])
            return {'text': text, 'raw': text}
        url = self.base_url.rstrip('/') + '/chat'
        # 不在此处记录敏感头，直接传递给 client；client 会保存 body/response 为 artifact，但不会保存 headers
        resp = await post_json(url, body, headers or {}, self.default_timeout_ms)
        raw = resp.get('text','')
        # 尝试从 OpenAI 兼容结构中抽取纯文本
        try:
            text = extract_text_from_openai_compat(raw)
        except Exception:
            text = raw
        return {'text': text, 'raw': raw}
