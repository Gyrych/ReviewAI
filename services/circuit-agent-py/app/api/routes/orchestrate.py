from fastapi import APIRouter, Request, UploadFile, File
from app.core.config import get_config
from app.infra.storage.artifact_store_fs import ArtifactStoreFs
from app.services.timeline_service import TimelineService
from app.infra.providers.vision import OpenRouterVisionProvider
from app.infra.search.openrouter_search import OpenRouterSearch
from app.services.direct_review import DirectReviewUseCase
from app.services.identify_key_facts import IdentifyKeyFactsUseCase
from app.schemas.domain import ReviewRequest, FileItem
import json
import tempfile
import shutil

router = APIRouter()

@router.post('/orchestrate/review')
async def orchestrate_review(request: Request, files: list[UploadFile] = File(None)):
    cfg = get_config()
    artifact = ArtifactStoreFs(cfg.storage_root)
    timeline = TimelineService()
    vision = OpenRouterVisionProvider(cfg.openrouter_base, cfg.llm_timeout_ms)
    search = OpenRouterSearch(cfg.openrouter_base, cfg.llm_timeout_ms)
    direct = DirectReviewUseCase(vision, artifact, timeline, search)
    identify = IdentifyKeyFactsUseCase(vision, artifact, timeline)

    form = await request.form()
    try:
        body = form.get('request') or form.get('body') or None
        if body:
            body = json.loads(body)
        else:
            body = {}
            for k in ('requirements','specs','dialog','systemPrompt','language'):
                if k in form:
                    body[k] = form.get(k)
        file_items = []
        if files:
            for f in files:
                suffix = ''
                if f.filename and '.' in f.filename:
                    suffix = '.' + f.filename.split('.')[-1]
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
                try:
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
        return {'error': 'invalid request', 'detail': str(e)}

    # 若 directReview 显式为 true，调用 direct 用例
    if form.get('directReview') == 'true' or (rr and getattr(rr, 'directReview', False)):
        resp = await direct.execute(api_url=cfg.openrouter_base, model=form.get('model') or 'default', request=rr, auth_header=request.headers.get('authorization'))
        # cleanup
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
    # 否则调用 identify 用例
    resp = await identify.execute(api_url=cfg.openrouter_base, model=form.get('model') or 'default', request=rr, auth_header=request.headers.get('authorization'))
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
