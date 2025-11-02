import json
import os
import uuid
from typing import Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI
from openai._streaming import Stream
from openai.types.responses import (
    ResponseInputFileParam,
    ResponseInputImageParam,
    ResponseInputItemParam,
    ResponseInputMessageContentListParam,
    ResponseInputTextParam,
    ResponseStreamEvent,
    ToolParam,
)
from openai.types.responses.response_input_item_param import Message
from pydantic import BaseModel

from .schemas import MessageUI
from .system_prompt import REASONING_SYSTEM_PROMPT, SYSTEM_PROMPT
from .tools import get_current_weather

load_dotenv(".env.local")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins. In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY"),
)


class Request(BaseModel):
    messages: List[MessageUI]
    model: str
    search: bool = False
    reasoning: bool = False


# Tool call state tracking
class ToolCallState(BaseModel):
    id: str
    name: str
    arguments_buffer: str = ""


available_tools = {
    "get_current_weather": get_current_weather,
}


def convert_to_openai_messages(messages: List[MessageUI], reasoning: bool) -> List[ResponseInputItemParam]:
    processed_messages: list[ResponseInputItemParam] = []

    system_prompt = REASONING_SYSTEM_PROMPT if reasoning else SYSTEM_PROMPT

    # Adding System Prompt at the beginning
    processed_messages.append(
            Message(
                role="system",
                content=[
                    ResponseInputTextParam(text=system_prompt, type="input_text")
                ],
            )
        )

    for _, msg in enumerate(messages):
            content: ResponseInputMessageContentListParam = []

            for _, part in enumerate(msg.parts):
                if part.type == "text":
                    content.append(
                        ResponseInputTextParam(text=part.text, type="input_text")
                    )
                elif part.type == "data-citation":
                    try:
                        encoded = str(json.dumps(part.data))
                        content.append(
                            ResponseInputTextParam(text=encoded, type="input_text")
                        )
                    except Exception as e:
                        print(e)
                        pass
                elif part.type == "file" and part.mediaType == "image/png":
                    sanitized_filename = 'file-' + (''.join(c for c in part.filename if c.isalnum() or c in ['_', '-']) if part.filename else str(uuid.uuid4()))
                    content.append(
                        ResponseInputImageParam(
                            detail="auto",
                            image_url=part.url,
                            file_id=sanitized_filename,
                            type="input_image",
                        )
                    )
                elif part.type == "file":
                    content.append(
                        ResponseInputFileParam(
                            filename=str(part.filename),
                            file_url=part.url,
                            type="input_file",
                        )
                    )
                else:
                    pass
            
            # OpenAI Latest API doesn't allow to have role "assistant" so we send everything as "user"
            processed_msg: Message = Message(
                role="user",
                content=content,
            )

            processed_messages.append(processed_msg)

    return processed_messages


def stream_text(openai_messages: List[ResponseInputItemParam], protocol: str = 'data', model: str = 'gpt-5-nano', search: bool = False):

    tools: List[ToolParam] = [
        {
            "type": "function",
            "name": "get_current_weather",
            "description": "Get current temperature for a given location.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "City and country e.g. Bogotá, Colombia",
                    }
                },
                "required": ["location"],
                "additionalProperties": False,
            },
            "strict": True,
        }
    ]

    if search:
        tools.append({"type": "web_search"})

    stream: Stream[ResponseStreamEvent] = client.responses.create(
        model=model,
        input=openai_messages,
        stream=True,
        tools=tools
    )

    # When protocol is set to "text", you will send a stream of plain text chunks
    if (protocol == 'text'):
        for event in stream:
            text_chunk: str | None = getattr(event, "delta", None)
            if text_chunk:
                yield text_chunk

    # When protocol is set to "data", you will send AI SDK protocol events
    elif (protocol == 'data'):
        
        # State machine
        mode = "text"  # Can be "text", "reasoning", "citation", or "file"
        
        # Buffers
        tag_search_buffer = ""
        in_tag_detection = False
        content_buffer = ""

        # Tool call tracking - now type-safe
        tool_calls: Dict[str, ToolCallState] = {}
        
        # Current streaming IDs
        current_text_id = None
        current_reasoning_id = None

        def detect_tag(char: str):
            """
            Detect <think>, </think>, <custom_data_citation>, </custom_data_citation> tags.
            Returns: (tag_found, tag_name) or (False, None)
            """
            nonlocal in_tag_detection, tag_search_buffer
            
            if char == "<":
                in_tag_detection = True
                tag_search_buffer = "<"
                return False, None
            
            if not in_tag_detection:
                return False, None
            
            tag_search_buffer += char
            
            # Check for <think>
            if tag_search_buffer == "<think>":
                in_tag_detection = False
                tag_search_buffer = ""
                return True, "think"
            
            # Check for </think>
            if tag_search_buffer == "</think>":
                in_tag_detection = False
                tag_search_buffer = ""
                return True, "/think"
            
            # Check for <custom_data_citation>
            if tag_search_buffer == "<custom_data_citation>":
                in_tag_detection = False
                tag_search_buffer = ""
                return True, "custom_data_citation"
            
            # Check for </custom_data_citation>
            if tag_search_buffer == "</custom_data_citation>":
                in_tag_detection = False
                tag_search_buffer = ""
                return True, "/custom_data_citation"
            
            # If buffer gets too long without matching, it's not one of our tags
            if len(tag_search_buffer) > 30:
                in_tag_detection = False
                passthrough = tag_search_buffer
                tag_search_buffer = ""
                return True, ("passthrough", passthrough)
            
            # Still accumulating potential tag
            return False, None

        def process_char(char: str):
            """Process a single character based on current mode."""
            nonlocal mode, content_buffer, current_text_id, current_reasoning_id
            
            # Detect tags
            tag_found, tag_name = detect_tag(char)
            
            if tag_found:
                if isinstance(tag_name, tuple) and tag_name[0] == "passthrough":
                    # Not our tag, output as regular text
                    passthrough_text = tag_name[1]
                    if mode == "text":
                        if current_text_id is None:
                            current_text_id = str(uuid.uuid4())
                            yield ('text-start', current_text_id)
                        yield ('text-delta', current_text_id, passthrough_text)
                    elif mode == "reasoning":
                        if current_reasoning_id:
                            yield ('reasoning-delta', current_reasoning_id, passthrough_text)
                    return
                
                elif tag_name == "think":
                    # End text mode, start reasoning
                    if current_text_id:
                        yield ('text-end', current_text_id)
                        current_text_id = None
                    
                    mode = "reasoning"
                    current_reasoning_id = str(uuid.uuid4())
                    yield ('reasoning-start', current_reasoning_id)
                    content_buffer = ""
                    return
                
                elif tag_name == "/think":
                    # End reasoning mode, back to text
                    if current_reasoning_id:
                        yield ('reasoning-end', current_reasoning_id)
                        current_reasoning_id = None
                    mode = "text"
                    content_buffer = ""
                    return
                
                elif tag_name == "custom_data_citation":
                    # End current mode, start citation parsing
                    if current_text_id:
                        yield ('text-end', current_text_id)
                        current_text_id = None
                    if current_reasoning_id:
                        yield ('reasoning-end', current_reasoning_id)
                        current_reasoning_id = None
                    
                    mode = "citation"
                    content_buffer = ""
                    return
                
                elif tag_name == "/custom_data_citation":
                    # End citation, parse and emit
                    try:
                        citation_data = json.loads(content_buffer.strip())
                        citation_id = str(uuid.uuid4())
                        yield ('data-citation', citation_id, citation_data)
                    except json.JSONDecodeError as e:
                        print(f"Error parsing citation JSON: {e}")
                    
                    mode = "text"
                    content_buffer = ""
                    return
                
                return
            
            # If in tag detection, don't process character yet
            if in_tag_detection:
                return
            
            # Process character based on mode
            if mode == "text":
                if current_text_id is None:
                    current_text_id = str(uuid.uuid4())
                    yield ('text-start', current_text_id)
                yield ('text-delta', current_text_id, char)
            
            elif mode == "reasoning":
                if current_reasoning_id:
                    yield ('reasoning-delta', current_reasoning_id, char)
            
            elif mode == "citation":
                content_buffer += char

        # Main streaming loop
        for event in stream:
            try:
                # Handle function call arguments delta
                if event.type == "response.function_call_arguments.delta":
                    item_id_delta: str = event.item_id
                    delta: str = event.delta
                    
                    # Initialize tool call state if new
                    if item_id_delta not in tool_calls:
                        # Store the tool call with empty name for now
                        tool_calls[item_id_delta] = ToolCallState(
                            id=item_id_delta,
                            name="get_current_weather",  
                            arguments_buffer=""
                        )
                        
                        # Emit tool-input-start with the correct tool name
                        yield f"data: {json.dumps({
                            'type': 'tool-input-start',
                            'toolCallId': item_id_delta,
                            'toolName': 'get_current_weather'
                        })}\n\n"
                    
                    # Accumulate arguments
                    tool_calls[item_id_delta].arguments_buffer += delta
                    
                    # Emit tool-input-delta
                    yield f"data: {json.dumps({
                        'type': 'tool-input-delta',
                        'toolCallId': item_id_delta,
                        'inputTextDelta': delta
                    })}\n\n"
                
                # Handle function call completed
                elif event.type == 'response.function_call_arguments.done':
                    item_id: str = event.item_id
                    function_name: str = event.name
                    arguments_str: str = event.arguments
                    
                    # Update tool call with function name from the event
                    if item_id in tool_calls:
                        tool_calls[item_id].name = function_name
                    
                    try:
                        # Parse the tool arguments
                        tool_args: dict = json.loads(arguments_str)
                        
                        # Emit tool-input-available with correct tool name
                        yield f"data: {json.dumps({
                            'type': 'tool-input-available',
                            'toolCallId': item_id,
                            'toolName': function_name,
                            'input': tool_args
                        })}\n\n"
                        
                        # Execute the tool if available
                        if function_name in available_tools:
                            tool_result = available_tools[function_name](**tool_args)
                            
                            # Emit tool-output-available
                            yield f"data: {json.dumps({
                                'type': 'tool-output-available',
                                'toolCallId': item_id,
                                'output': tool_result
                            })}\n\n"
                        else:
                            print(f"Warning: Tool '{function_name}' not found in available_tools")
                        
                        # Clean up tool call state
                        if item_id in tool_calls:
                            del tool_calls[item_id]
                    
                    except json.JSONDecodeError as e:
                        print(f"Error parsing tool arguments for {function_name}: {e}")
                        print(f"Arguments string: {arguments_str}")
                
                # Handle regular content delta
                else:
                    content_chunk: str | None = getattr(event, "delta", None)
                    
                    if content_chunk:
                        # Process content character by character
                        for char in content_chunk:
                            for result in process_char(char):
                                if result[0] == 'text-start':
                                    yield f"data: {json.dumps({'type': 'text-start', 'id': result[1]})}\n\n"
                                elif result[0] == 'text-delta':
                                    yield f"data: {json.dumps({'type': 'text-delta', 'id': result[1], 'delta': result[2]})}\n\n"
                                elif result[0] == 'text-end':
                                    yield f"data: {json.dumps({'type': 'text-end', 'id': result[1]})}\n\n"
                                elif result[0] == 'reasoning-start':
                                    yield f"data: {json.dumps({'type': 'reasoning-start', 'id': result[1]})}\n\n"
                                elif result[0] == 'reasoning-delta':
                                    yield f"data: {json.dumps({'type': 'reasoning-delta', 'id': result[1], 'delta': result[2]})}\n\n"
                                elif result[0] == 'reasoning-end':
                                    yield f"data: {json.dumps({'type': 'reasoning-end', 'id': result[1]})}\n\n"
                                elif result[0] == 'data-citation':
                                    yield f"data: {json.dumps({'type': 'data-citation', 'id': result[1], 'data': result[2]})}\n\n"
                
            except Exception as event_error:
                print(f"Error processing event: {event_error}")
                import traceback
                traceback.print_exc()
                continue
        
        # Cleanup: End any active blocks
        if current_text_id:
            yield f"data: {json.dumps({'type': 'text-end', 'id': current_text_id})}\n\n"
        if current_reasoning_id:
            yield f"data: {json.dumps({'type': 'reasoning-end', 'id': current_reasoning_id})}\n\n"
        
        # Emit finish events
        yield f"data: {json.dumps({'type': 'finish'})}\n\n"
        yield "data: [DONE]\n\n"


@app.post("/api/chat")
async def handle_chat_data(request: Request, protocol: str = Query('data')) -> StreamingResponse:
    messages: List[MessageUI] = request.messages
    openai_messages: List[ResponseInputItemParam] = convert_to_openai_messages(messages, request.reasoning)

    headers = {
        "Cache-Control": "no-cache",
        "x-vercel-ai-data-stream": "v1",
        "Content-Type": "text/event-stream",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    response: StreamingResponse = StreamingResponse(
        content=stream_text(openai_messages, protocol, request.model, request.search),
        headers=headers,
        media_type="text/event-stream",
    )

    return response