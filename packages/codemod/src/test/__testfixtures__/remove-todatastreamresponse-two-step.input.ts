// @ts-nocheck
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
  });

  // direct return
  return result.toDataStreamResponse();
}

export async function handler(req: Request) {
  const stream = streamText({ model, prompt });
  
  // with options
  const response = stream.toUIMessageStreamResponse({ 
    status: 200,
    headers: { 'custom': 'header' },
    onError: error => 'Custom error'
  });
  
  return response;
}

// variable assignment
export async function anotherHandler() {
  const result = streamText({ model, messages });
  
  const opts = {
    status: 201,
    onError: error => {
      return {
        errorCode: 'STREAM_ERROR',
        message: 'An error occurred',
      };
    },
  };
  
  const streamResponse = result.toUIMessageStreamResponse(opts);
  return streamResponse;
}

// conditional return
function conditionalHandler(useStream: boolean) {
  const result = streamText({ model, messages });
  
  if (useStream) {
    return result.toDataStreamResponse();
  }
  
  return result.toUIMessageStreamResponse({
    sendReasoning: true
  });
}