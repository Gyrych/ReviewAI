from typing import Any, Dict
from pathlib import Path
import json
from app.core.config import get_config

class TimelineService:
    def __init__(self, progress_store=None):
        self.progress_store = progress_store
        self.root = Path(get_config().storage_root)
        (self.root / 'timeline').mkdir(parents=True, exist_ok=True)

    def make(self, event: str, payload: Dict[str,Any], meta: Dict[str,Any]) -> Dict[str,Any]:
        return { 'event': event, 'payload': payload, 'meta': meta }

    async def push(self, progress_id: Any, timeline_item: Dict[str,Any]):
        # 持久化到文件：使用时间戳 + event 名称
        try:
            ts = __import__('datetime').datetime.utcnow().isoformat().replace(':','-')
            name = f"{ts}_{timeline_item.get('event','item')}.json"
            p = self.root / 'timeline' / name
            p.write_text(json.dumps(timeline_item, ensure_ascii=False, indent=2), encoding='utf-8')
            return True
        except Exception:
            return False

    def list(self):
        items = []
        for p in sorted((self.root / 'timeline').glob('*.json')):
            try:
                items.append(json.loads(p.read_text(encoding='utf-8')))
            except Exception:
                continue
        return items
