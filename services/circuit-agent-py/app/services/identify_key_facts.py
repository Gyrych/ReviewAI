from typing import Any, Dict, List, Optional
from app.infra.providers.vision import OpenRouterVisionProvider
from app.infra.storage.artifact_store_fs import ArtifactStoreFs
from app.services.timeline_service import TimelineService

class IdentifyKeyFactsUseCase:
    def __init__(self, vision: OpenRouterVisionProvider, artifact: ArtifactStoreFs, timeline: TimelineService):
        self.vision = vision
        self.artifact = artifact
        self.timeline = timeline

    async def execute(self, api_url: str, model: str, request: Dict[str,Any], auth_header: Optional[str]=None) -> Dict[str,Any]:
        # stub: 调用 vision provider 对图像进行简要识别，返回 keyComponents, keyTechRoutes
        # 行为与 TS 保持兼容：返回 { keyComponents: [], keyTechRoutes: [] }
        return {'keyComponents': [], 'keyTechRoutes': []}
