from fastapi import APIRouter, UploadFile, File, Form, Depends, Request
from typing import List, Optional
from app.services.direct_review import DirectReviewUseCase
from app.infra.storage.artifact_store_fs import ArtifactStoreFs
from app.services.timeline_service import TimelineService
from app.infra.providers.vision import OpenRouterVisionProvider
from app.infra.search.openrouter_search import OpenRouterSearch
from app.core.config import get_config
from app.schemas.domain import ReviewRequest, FileItem
import tempfile
import shutil

router = APIRouter()

@router.post('/modes/direct/review')
async def direct_review(request: Request, files: Optional[List[UploadFile]] = File(None)):
    cfg = get_config()
    artifact = ArtifactStoreFs(cfg.storage_root)
    timeline = TimelineService()
    vision = OpenRouterVisionProvider(cfg.openrouter_base, cfg.llm_timeout_ms)
    search = OpenRouterSearch(cfg.openrouter_base, cfg.llm_timeout_ms)
    usecase = DirectReviewUseCase(vision, artifact, timeline, search)

    # parse form fields (要求客户端以表单字段提交 JSON 字段)
    form = await request.form()
    try:
        req_json = form.get('request') or form.get('body') or None
        if req_json:
            import json
            body = json.loads(req_json)
        else:
            # 构建 ReviewRequest from form fields
            body = {}
            for k in ('requirements','specs','dialog','systemPrompt','language'):
                if k in form:
                    body[k] = form.get(k)
        # attach files -> write to temp files
        file_items = []
        if files:
            for f in files:
                suffix = ''
                if f.filename and '.' in f.filename:
                    suffix = '.' + f.filename.split('.')[-1]
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
                try:
                    # stream write
                    while True:
                        chunk = await f.read(1024*64)
                        if not chunk:
                            break
                        tmp.write(chunk)
                    tmp.flush()
                    tmp.close()
                    file_items.append(FileItem(filename=f.filename, mime=f.content_type, path=tmp.name))
                except Exception:
                    try:
                        tmp.close()
                    except Exception:
                        pass
        body['files'] = file_items
        rr = ReviewRequest(**body)
    except Exception as e:
        return { 'error': 'invalid request', 'detail': str(e) }

    auth = request.headers.get('authorization')
    resp = await usecase.execute(api_url=cfg.openrouter_base, model=form.get('model') or 'default', request=rr, auth_header=auth)

    # cleanup temp files
    try:
        for fi in file_items:
            if fi.path:
                try:
                    shutil.os.remove(fi.path)
                except Exception:
                    pass
    except Exception:
        pass

    return resp
