import os
from typing import List
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from openai import OpenAI
from .utils.prompt import ClientMessage, convert_to_openai_messages


load_dotenv(".env.local")

app = FastAPI()

client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY"),
)


class Request(BaseModel):
    messages: List[ClientMessage]


@app.post("/api/chat", response_class=PlainTextResponse)
def hello_world(request: Request):
    messages = request.messages
    openai_messages = convert_to_openai_messages(messages)

    completion = client.chat.completions.create(
        messages=openai_messages,
        model="gpt-4o",
    )

    for choice in completion.choices:
        if choice.message.tool_calls is None:
            return choice.message.content
