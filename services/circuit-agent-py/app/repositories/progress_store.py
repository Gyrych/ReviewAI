import asyncio
from typing import Optional

try:
    import aioredis
except Exception:
    aioredis = None

class ProgressMemoryStore:
    def __init__(self):
        self._store = {}

    async def set(self, key: str, value: str, ttl: Optional[int]=None):
        self._store[key] = value

    async def get(self, key: str):
        return self._store.get(key)

class ProgressRedisStore:
    def __init__(self, redis_url: str):
        if aioredis is None:
            raise RuntimeError('aioredis not available')
        self._redis = aioredis.from_url(redis_url)

    async def connect(self):
        # aioredis lazy connect
        return

    async def set(self, key: str, value: str, ttl: Optional[int]=None):
        if ttl:
            await self._redis.set(key, value, ex=ttl)
        else:
            await self._redis.set(key, value)

    async def get(self, key: str):
        v = await self._redis.get(key)
        return v.decode('utf-8') if v else None
