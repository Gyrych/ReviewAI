from typing import Any, Dict, List, Optional
from app.infra.http.openrouter_client import post_json, extract_text_from_openai_compat
from app.core.config import get_config
import base64

class OpenRouterVisionProvider:
    def __init__(self, base_url: str, default_timeout_ms: int):
        self.base_url = base_url
        self.default_timeout_ms = default_timeout_ms

    async def chat_rich(self, api_url: str, model: str, messages: List[Dict[str, Any]], headers: Optional[Dict[str,str]]=None, timeout_ms: Optional[int]=None) -> Dict[str,Any]:
        # 如果 base_url 为空则返回 mock
        if not self.base_url:
            text = 'Mocked LLM response text'
            return {'text': text, 'raw': text}
        # 处理 messages 中的 image_path：尝试将文件转换为 base64 data-url，以兼容现有 OpenRouter 文本接口
        proc_messages = []
        for m in messages:
            try:
                if isinstance(m, dict) and m.get('content') and isinstance(m.get('content'), list):
                    # user message with parts
                    new_parts = []
                    for p in m.get('content'):
                        if p.get('type') == 'image_path' and p.get('image_path') and p['image_path'].get('path'):
                            pth = p['image_path']['path']
                            try:
                                with open(pth, 'rb') as fh:
                                    b = fh.read()
                                b64 = base64.b64encode(b).decode('ascii')
                                url = f"data:{p['image_path'].get('mime','application/octet-stream')};base64,{b64}"
                                new_parts.append({'type': 'image_url', 'image_url': {'url': url}})
                            except Exception:
                                # skip file on error
                                continue
                        else:
                            new_parts.append(p)
                    proc_messages.append({'role': m.get('role'), 'content': new_parts})
                else:
                    proc_messages.append(m)
            except Exception:
                proc_messages.append(m)
        url = self.base_url.rstrip('/') + '/chat'
        body = {'model': model, 'messages': proc_messages}
        resp = await post_json(url, body, headers or {}, timeout_ms or self.default_timeout_ms)
        raw = resp.get('text','')
        try:
            text = extract_text_from_openai_compat(raw)
        except Exception:
            text = raw
        return {'text': text, 'raw': raw}
