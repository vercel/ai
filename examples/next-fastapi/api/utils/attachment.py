from pydantic import BaseModel


class ClientAttachment(BaseModel):
    name: str
    contentType: str
    url: str
