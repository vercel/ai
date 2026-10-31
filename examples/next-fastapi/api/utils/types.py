from typing import Any, Optional

from pydantic import BaseModel


class ClientAttachment(BaseModel):
    name: str
    contentType: str
    url: str


class ToolInvocation(BaseModel):
    toolCallId: str
    toolName: str
    args: dict
    result: dict


class ClientPart(BaseModel):
    type: str
    toolCallId: Optional[str] = None
    text: Optional[str] = None
    url: Optional[str] = None
    mediaType: Optional[str] = None
    input: Optional[Any] = None
    output: Optional[Any] = None
    state: Optional[str] = None
