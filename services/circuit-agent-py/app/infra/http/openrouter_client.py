import httpx
import asyncio
from typing import Any, Dict
from app.core.config import get_config
from app.infra.storage.artifact_store_fs import ArtifactStoreFs

artifact_store = ArtifactStoreFs(get_config().storage_root)

async def post_json(url: str, body: Any, headers: Dict[str,str], timeout_ms: int) -> Dict[str, Any]:
    cfg = get_config()
    timeout_s = max(0.1, timeout_ms / 1000.0)
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        try:
            # 保存请求体（不含敏感头）
            try:
                await artifact_store.save(JSONify(body), 'llm_request', {'ext': '.json'})
            except Exception:
                pass
            resp = await client.post(url, json=body, headers=headers)
            text = resp.text
            try:
                await artifact_store.save(text or '', 'llm_response', {'ext': '.json'})
            except Exception:
                pass
            out_headers = {k: v for k, v in resp.headers.items()}
            return { 'ok': resp.is_success, 'status': resp.status_code, 'text': text, 'headers': out_headers }
        except httpx.ReadTimeout:
            raise Exception('upstream timeout')


def extract_text_from_openai_compat(txt: str) -> str:
    try:
        import json
        j = json.loads(txt)
        if isinstance(j, dict) and 'choices' in j and j['choices']:
            c = j['choices'][0]
            if isinstance(c, dict) and 'message' in c and c['message'] and 'content' in c['message']:
                return c['message']['content']
            if isinstance(c, dict) and 'text' in c:
                return c['text']
        if isinstance(j, str):
            return j
    except Exception:
        pass
    return txt

# helper to convert body to JSON string safely

def JSONify(obj: Any) -> str:
    import json
    try:
        return json.dumps(obj, ensure_ascii=False, indent=2)
    except Exception:
        try:
            return str(obj)
        except Exception:
            return ''
