import json
from pydantic import BaseModel
from typing import List, Optional
from .types import ClientAttachment, ClientPart, ToolInvocation


class ClientMessage(BaseModel):
    role: str
    content: Optional[str] = None
    parts: Optional[List[ClientPart]] = None
    experimental_attachments: Optional[List[ClientAttachment]] = None
    toolInvocations: Optional[List[ToolInvocation]] = None


def convert_to_openai_messages(messages: List[ClientMessage]):
    openai_messages = []

    for message in messages:
        parts = []

        if message.parts:
            for part in message.parts:
                if part.type == 'text' and part.text is not None:
                    parts.append({'type': 'text', 'text': part.text})
                elif part.type == 'file' and part.url is not None:
                    if (part.mediaType or '').startswith('image/'):
                        parts.append({
                            'type': 'image_url',
                            'image_url': {'url': part.url},
                        })
                    elif (part.mediaType or '').startswith('text/'):
                        parts.append({'type': 'text', 'text': part.url})
        elif message.content:
            parts.append({'type': 'text', 'text': message.content})

        if (message.experimental_attachments):
            for attachment in message.experimental_attachments:
                if (attachment.contentType.startswith('image')):
                    parts.append({
                        'type': 'image_url',
                        'image_url': {
                            'url': attachment.url
                        }
                    })

                elif (attachment.contentType.startswith('text')):
                    parts.append({
                        'type': 'text',
                        'text': attachment.url
                    })

        current_tool_parts = [
            part for part in (message.parts or [])
            if part.type.startswith('tool-')
            and part.toolCallId is not None
            and part.input is not None
        ]

        if current_tool_parts:
            tool_calls = [
                {
                    'id': part.toolCallId,
                    'type': 'function',
                    'function': {
                        'name': part.type[5:],
                        'arguments': json.dumps(part.input),
                    },
                }
                for part in current_tool_parts
            ]

            openai_messages.append({
                'role': 'assistant',
                'content': parts or None,
                'tool_calls': tool_calls,
            })

            openai_messages.extend(
                {
                    'role': 'tool',
                    'content': json.dumps(part.output),
                    'tool_call_id': part.toolCallId,
                }
                for part in current_tool_parts
                if part.state == 'output-available'
            )
            continue

        if (message.toolInvocations):
            tool_calls = [
                {
                    'id': tool_invocation.toolCallId,
                    'type': 'function',
                    'function': {
                        'name': tool_invocation.toolName,
                        'arguments': json.dumps(tool_invocation.args)
                    }
                }
                for tool_invocation in message.toolInvocations]

            openai_messages.append({
                "role": 'assistant',
                "tool_calls": tool_calls
            })

            tool_results = [
                {
                    'role': 'tool',
                    'content': json.dumps(tool_invocation.result),
                    'tool_call_id': tool_invocation.toolCallId
                }
                for tool_invocation in message.toolInvocations]

            openai_messages.extend(tool_results)

            continue

        openai_messages.append({
            "role": message.role,
            "content": parts
        })

    return openai_messages
