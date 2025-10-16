from typing import Optional, List, Dict, Any
from app.schemas.domain import ReviewRequest, RichMessage, FileItem
from app.infra.storage.artifact_store_fs import ArtifactStoreFs
from app.infra.providers.vision import OpenRouterVisionProvider
from app.infra.search.openrouter_search import OpenRouterSearch
from app.services.timeline_service import TimelineService
from app.utils.prompt_loader import PromptLoader
import base64
import os

class DirectReviewUseCase:
    def __init__(self, vision: OpenRouterVisionProvider, artifact: ArtifactStoreFs, timeline: TimelineService, search_provider: Optional[OpenRouterSearch]=None):
        self.vision = vision
        self.artifact = artifact
        self.timeline = timeline
        self.search_provider = search_provider

    async def execute(self, api_url: str, model: str, request: ReviewRequest, auth_header: Optional[str]=None) -> Dict[str, Any]:
        progress_id = (request.options or {}).get('progressId')
        parts: List[Dict[str,Any]] = []
        sys = request.systemPrompt or ''
        if sys:
            parts.append({'role':'system','content': sys})
        # extraSystems
        if getattr(request, 'extraSystems', None):
            for s in (request.extraSystems or []):
                if isinstance(s, str) and s.strip():
                    parts.append({'role':'system','content': s})
        texts = []
        if request.requirements: texts.append(f"Design requirements:\n{request.requirements}")
        if request.specs: texts.append(f"Design specs:\n{request.specs}")
        if request.dialog: texts.append(f"User dialog:\n{request.dialog}")
        user_parts: List[Dict[str,Any]] = []
        if texts:
            user_parts.append({'type':'text','text':'\n\n'.join(texts)})
        # files: if path exists prefer streaming path to provider; fallback to base64 if only bytes present
        files = request.files or []
        for f in files:
            try:
                if getattr(f, 'path', None):
                    # pass path to provider as file reference
                    user_parts.append({'type':'image_path','image_path': {'path': f.path, 'filename': f.filename, 'mime': f.mime}})
                    continue
                content = f.bytes if getattr(f, 'bytes', None) is not None else None
                if content is None and getattr(f, 'file', None):
                    content = f.file.read()
                if content:
                    b64 = base64.b64encode(content).decode('ascii')
                    url = f"data:{f.mime or 'application/octet-stream'};base64,{b64}"
                    user_parts.append({'type':'image_url','image_url': {'url': url}})
            except Exception:
                pass
        parts.append({'role':'user','content': user_parts})

        # history injection
        if getattr(request, 'history', None):
            for h in (request.history or []):
                try:
                    role = h.get('role') if isinstance(h, dict) else None
                    content = h.get('content') if isinstance(h, dict) else None
                    if role and content:
                        r = 'assistant' if role == 'assistant' else 'user'
                        parts.append({'role': r, 'content': content})
                        continue
                    if h.get('modelMarkdown'):
                        parts.append({'role':'assistant','content': str(h.get('modelMarkdown'))})
                    if h.get('dialog'):
                        parts.append({'role':'user','content': str(h.get('dialog'))})
                except Exception:
                    pass

        # enableSearch
        try:
            enable_search = bool(getattr(request, 'enableSearch', False) or ((request.options or {}).get('enableSearch') is True))
            if enable_search and self.search_provider:
                qparts = []
                if request.requirements: qparts.append(request.requirements)
                if request.specs: qparts.append(request.specs)
                if request.dialog: qparts.append(request.dialog)
                q = '\n'.join(qparts) or ''
                if q:
                    topn = max(1, int(getattr(request, 'searchTopN', 1) or (request.options or {}).get('searchTopN', 1)))
                    hits = await self.search_provider.search(q, topn)
                    if hits:
                        summary = '\n'.join([f"{i+1}. {h['title']} — {h['url']}" for i,h in enumerate(hits)])
                        parts.insert(0, {'role':'system','content': f"Search results summary:\n{summary}"})
                        try:
                            await self.timeline.push(progress_id, self.timeline.make('search.results', {'count': len(hits), 'query': q}, {'origin':'backend','category':'search'}))
                        except Exception:
                            pass
                        idx = 0
                        for h in hits:
                            if idx >= topn: break
                            idx += 1
                            try:
                                s = await self.search_provider.summarize_url(h['url'], 1024, getattr(request, 'language', 'zh'))
                                lower = str(s or '').lower()
                                failed_marks = [
                                    '无法直接访问','无法直接打开','无法直接抓取','无法访问该网页内容',
                                    '抱歉，我目前无法直接打开或抓取外部 url','unable to access','not accessible'
                                ]
                                failed = (not s) or (len(s.strip()) < 50) or any(m in lower for m in failed_marks)
                                if failed:
                                    try:
                                        await self.timeline.push(progress_id, self.timeline.make('search.summary.failed', {'title': h['title'], 'url': h['url'], 'textSnippet': str(s or '')[:200]}, {'origin':'backend','category':'search'}))
                                    except Exception:
                                        pass
                                    continue
                                saved = await self.artifact.save(s, 'search_summary', {'ext': '.txt', 'contentType': 'text/plain'})
                                try:
                                    await self.timeline.push(progress_id, self.timeline.make('search.summary.saved', {'title': h['title'], 'url': h['url'], 'artifact': saved, 'summarySnippet': str(s)[:1000]}, {'origin':'backend','category':'search'}))
                                except Exception:
                                    pass
                                parts.insert(0, {'role':'system','content': f"External source summary ({h['title']} - {h['url']}):\n{s}"})
                            except Exception:
                                pass
        except Exception:
            pass

        # timeline request artifact
        try:
            request_body = {'model': model, 'messages': parts, 'stream': False}
            req_art = await self.artifact.save(JSONify(request_body), 'llm_request', {'ext': '.json'})
            tl_req = self.timeline.make('llm.request', {'apiUrl': api_url, 'model': model, 'messageCount': len(parts), 'hasHistory': bool(getattr(request, 'history', None)), 'hasAttachments': bool(getattr(request, 'files', None))}, {'origin':'backend','category':'llm'})
            tl_req['artifacts'] = {'request': req_art}
            try:
                await self.timeline.push(progress_id, tl_req)
            except Exception:
                pass
        except Exception:
            pass

        headers = {}
        if auth_header: headers['Authorization'] = auth_header
        # provider.chat_rich needs to accept messages that may contain image_path entries
        resp = await self.vision.chat_rich(api_url, model, parts, headers, timeout_ms=getattr(os.environ, 'LLM_TIMEOUT_MS', None))
        resp_raw = str(resp.get('raw') or '')
        resp_art = await self.artifact.save(resp_raw, 'llm_response', {'ext': '.json'})
        report_a = await self.artifact.save(str(resp.get('text') or ''), 'direct_review_report', {'ext': '.md'})
        tl_resp = self.timeline.make('llm.response', {'snippet': str(resp.get('text') or '')[:1000], 'contentLength': len(resp_raw)}, {'origin':'backend','category':'llm'})
        tl_resp['artifacts'] = {'response': resp_art, 'result': report_a}
        try:
            await self.timeline.push(progress_id, tl_resp)
        except Exception:
            pass

        return {'markdown': resp.get('text',''), 'timeline': [tl_req, tl_resp]}

# helper

def JSONify(obj: Any) -> str:
    import json
    try:
        return json.dumps(obj, ensure_ascii=False, indent=2)
    except Exception:
        return str(obj)
