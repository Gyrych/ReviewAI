from pydantic import BaseModel
from typing import Optional, List, Any, Dict

class FileItem(BaseModel):
    filename: Optional[str]
    mime: Optional[str]
    bytes: Optional[bytes] = None
    path: Optional[str] = None

class RichMessage(BaseModel):
    role: str
    content: Any

class ReviewRequest(BaseModel):
    requirements: Optional[str] = None
    specs: Optional[str] = None
    dialog: Optional[str] = None
    files: Optional[List[FileItem]] = None
    history: Optional[List[Dict[str,Any]]] = None
    systemPrompt: Optional[str] = None
    options: Optional[Dict[str,Any]] = None
    extraSystems: Optional[List[str]] = None
    enableSearch: Optional[bool] = None
    searchTopN: Optional[int] = None
    language: Optional[str] = None
