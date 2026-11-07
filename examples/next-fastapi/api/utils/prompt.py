import base64
import json
import urllib.parse
from pydantic import BaseModel
from typing import List, Optional
from .types import ClientAttachment, ClientPart, ToolInvocation


def _decode_data_url_text(url: str) -> str:
    if url.startswith('data:'):
        header, _, data = url.partition(',')
        if ';base64' in header:
            try:
                return base64.b64decode(data).decode('utf-8', errors='replace')
            except Exception:
                return url
        return urllib.parse.unquote(data)
    return url


def _get_tool_response_content(part: ClientPart) -> Optional[str]:
    if part.state == 'output-available':
        return json.dumps(part.output)
    if part.state == 'output-error':
        error_val = part.errorText
        if error_val is None:
            error_val = part.output if part.output is not None else 'Tool execution failed'
        return json.dumps(error_val)
    if part.state == 'output-denied':
        return json.dumps('Tool call execution denied.')
    return None


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
                        parts.append({
                            'type': 'text',
                            'text': _decode_data_url_text(part.url),
                        })
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
                        'text': _decode_data_url_text(attachment.url)
                    })

        current_tool_parts = [
            part for part in (message.parts or [])
            if (
                part.type.startswith('tool-')
                or (part.type == 'dynamic-tool' and part.toolName is not None)
            )
            and part.toolCallId is not None
            and part.input is not None
            and _get_tool_response_content(part) is not None
        ]

        if current_tool_parts:
            tool_calls = [
                {
                    'id': part.toolCallId,
                    'type': 'function',
                    'function': {
                        'name': (
                            part.type[5:]
                            if part.type.startswith('tool-')
                            else part.toolName
                        ),
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
                    'content': _get_tool_response_content(part),
                    'tool_call_id': part.toolCallId,
                }
                for part in current_tool_parts
            )
            # Prefer current UI parts over legacy toolInvocations if both have results.
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
