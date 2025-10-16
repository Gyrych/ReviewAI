from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import get_config
from app.api.routes import direct_review, health
from app.api.routes import orchestrate, sessions
from fastapi.responses import PlainTextResponse, JSONResponse
from fastapi.requests import Request as FastAPIRequest
from pathlib import Path
import os
from fastapi import HTTPException
from app.repositories.progress_store import ProgressMemoryStore, ProgressRedisStore
import asyncio
from app.core.logging import get_logger

logger = get_logger('circuit-agent-py')

cfg = get_config()
app = FastAPI()

# 初始化进度存储：优先 Redis，回退 Memory
progress_store = ProgressMemoryStore()

async def init_progress_store():
    global progress_store
    if cfg.redis_url:
        try:
            rs = ProgressRedisStore(cfg.redis_url)
            await rs.connect()
            progress_store = rs
            print('[circuit-agent-py] Progress store: Redis')
            return
        except Exception as e:
            print('[circuit-agent-py] Progress store: Redis failed, falling back to Memory', str(e))
    progress_store = ProgressMemoryStore()
    print('[circuit-agent-py] Progress store: Memory (fallback)')

# 在启动时初始化（uvicorn 可以调用）
import asyncio
asyncio.get_event_loop().create_task(init_progress_store())

from fastapi import APIRouter
progress_router = APIRouter()

@progress_router.get('/progress/{id}')
async def get_progress(id: str):
    try:
        v = await progress_store.get(id)
        if v is None:
            raise HTTPException(status_code=404, detail='not found')
        return v
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

app.include_router(progress_router, prefix=cfg.base_path)

# CORS 配置：与原服务保持一致的白名单
origins = [
    'http://localhost:3002', 'http://127.0.0.1:3002',
    'http://localhost:3003', 'http://127.0.0.1:3003',
    'http://localhost:5173', 'http://127.0.0.1:5173'
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# 挂载 static artifacts 目录
app.mount(f"{cfg.base_path}/artifacts", StaticFiles(directory=cfg.storage_root + '/artifacts'), name='artifacts')

# 注册路由
app.include_router(health.router, prefix=cfg.base_path)
app.include_router(direct_review.router, prefix=cfg.base_path)
app.include_router(orchestrate.router, prefix=cfg.base_path)
app.include_router(sessions.router, prefix=cfg.base_path)

# system-prompt route
@app.get(f"{cfg.base_path}/system-prompt")
async def system_prompt(lang: str = 'zh'):
    repo_root = Path(__file__).resolve().parents[4]
    filename = 'SystemPrompt.md' if lang == 'en' else '系统提示词.md'
    preferred = repo_root / 'ReviewAIPrompt' / filename
    fallback = repo_root / filename
    p = preferred if preferred.exists() else (fallback if fallback.exists() else None)
    if not p:
        return PlainTextResponse('{"error":"system prompt not found"}', status_code=404, media_type='application/json')
    return PlainTextResponse(p.read_text(encoding='utf-8'))


@app.get("/health")
async def health():
    return {"status": "ok"}

# 路由将在后续实现中注册

# 运行示例：uvicorn app.main:app --reload --port <PORT>

@app.exception_handler(Exception)
async def global_exception_handler(request: FastAPIRequest, exc: Exception):
    logger.exception('Unhandled exception', exc_info=exc)
    return JSONResponse(status_code=500, content={'error': 'internal error'})
