from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class MessageUIRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class BaseUIPart(BaseModel):
    providerMetadata: Optional[dict[str, Any]] = None


class TextUIPart(BaseUIPart):
    type: Literal["text"] = "text"
    text: str


class ReasoningUIPart(BaseUIPart):
    type: Literal["reasoning"] = "reasoning"
    text: str


class SourceUrlUIPart(BaseUIPart):
    type: Literal["source-url"] = "source-url"
    sourceId: str
    url: str
    title: Optional[str] = None


class SourceDocumentUIPart(BaseUIPart):
    type: Literal["source-document"] = "source-document"
    sourceId: str
    mediaType: str
    title: str
    filename: Optional[str] = None


class FileUIPart(BaseUIPart):
    type: Literal["file"] = "file"
    url: str
    mediaType: str
    filename: Optional[str] = None


# CUSTOM DATA (AI SDK `data-${NAME}`)


# Citation Custom Data
class DataCitationUIPartData(BaseModel):
    title: str
    url: str
    description: str
    number: int

class DataCitationUIPart(BaseUIPart):
    type: Literal["data-citation"] = "data-citation"
    data: DataCitationUIPartData


class ToolUIWeatherInput(BaseModel):
    location: str
    unit: Optional[Literal["celsius", "fahrenheit"]] = None

class ToolUIGetWeatherToolPart(BaseUIPart):
    type: Literal["tool-get_current_weather"] = "tool-get_current_weather"
    input: ToolUIWeatherInput
    toolCallId: str
    state: str


MessageUIPart = Annotated[
    TextUIPart
    | ReasoningUIPart
    | SourceUrlUIPart
    | SourceDocumentUIPart
    | FileUIPart
    | DataCitationUIPart
    | ToolUIGetWeatherToolPart,
    Field(discriminator="type"),
]
MessageUIParts = list[MessageUIPart]



class FeedbackMetadata(BaseModel):
    liked: bool = False
    disliked: bool = False
    copied: bool = False


class TimestampMetadata(BaseModel):
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class MessageUIMetadata(BaseModel):
    timestamp: TimestampMetadata = Field(default_factory=TimestampMetadata)
    feedback: FeedbackMetadata = Field(default_factory=FeedbackMetadata)


class MessageUI(BaseModel):
    """**AI SDK V5 UIMessage** - 100% Compatible."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    role: MessageUIRole
    parts: MessageUIParts
    metadata: Optional[MessageUIMetadata] = Field(default_factory=MessageUIMetadata)
