import os
from pathlib import Path
from typing import Optional, List

class PromptLoadError(Exception):
    def __init__(self, message: str, path: str):
        super().__init__(f"{message} (path: {path})")
        self.path = path

class PromptLoader:
    _cache = {}

    @staticmethod
    def _project_root() -> Path:
        # 假设 services/circuit-agent-py 在仓库 services 下
        p = Path(__file__).resolve()
        # app/utils -> app -> services/circuit-agent-py
        return p.parents[4]

    @classmethod
    def load_prompt(cls, agent_name: str, prompt_type: str, language: str, variant: Optional[str]=None) -> str:
        if prompt_type == 'system':
            if variant in ('initial', 'revision'):
                filename = f"system_prompt_{variant}_{language}.md"
            else:
                filename = f"system_prompt_{language}.md"
        else:
            if not variant:
                raise PromptLoadError('variant is required for pass type prompts', f'ReviewAIPrompt/{agent_name}/[variant]_prompt.md')
            filename = f"{variant}_prompt.md"

        rel = Path('ReviewAIPrompt') / agent_name / filename
        abs_path = (cls._project_root() / rel).resolve()
        key = str(abs_path)
        if key in cls._cache:
            return cls._cache[key]
        if not abs_path.exists():
            raise PromptLoadError('Prompt file not found', str(abs_path))
        content = abs_path.read_text(encoding='utf-8').strip()
        if not content:
            raise PromptLoadError('Prompt file is empty', str(abs_path))
        cls._cache[key] = content
        return content

    @classmethod
    def clear_cache(cls):
        cls._cache.clear()

    @classmethod
    def preload_prompts(cls, agent_name: str, variants: List[dict], languages: List[str]):
        for v in variants:
            for lang in languages:
                try:
                    cls.load_prompt(agent_name, v.get('type'), lang, v.get('variant'))
                except Exception as e:
                    print(f"[PromptLoader] failed preload: {e}")
