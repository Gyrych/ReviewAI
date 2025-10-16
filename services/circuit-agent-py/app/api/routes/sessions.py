from fastapi import APIRouter, Request
from pathlib import Path
import json
from app.core.config import get_config

router = APIRouter()

_storage_root = Path(get_config().storage_root)
_sessions_dir = _storage_root / 'sessions'
_sessions_dir.mkdir(parents=True, exist_ok=True)

@router.post('/sessions/save')
async def save_session(req: Request):
    body = await req.json()
    import uuid
    sid = body.get('id') or str(uuid.uuid4())
    f = _sessions_dir / f"{sid}.json"
    f.write_text(json.dumps(body, ensure_ascii=False, indent=2), encoding='utf-8')
    return {'id': sid}

@router.get('/sessions/list')
async def list_sessions():
    items = []
    for p in _sessions_dir.glob('*.json'):
        items.append(p.stem)
    return {'items': items}

@router.get('/sessions/{id}')
async def read_session(id: str):
    p = _sessions_dir / f"{id}.json"
    if not p.exists():
        return {'error': 'not found'}
    import json
    return json.loads(p.read_text(encoding='utf-8'))

@router.delete('/sessions/{id}')
async def delete_session(id: str):
    p = _sessions_dir / f"{id}.json"
    if p.exists():
        p.unlink()
    return {'ok': True}
