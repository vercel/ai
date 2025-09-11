// @ts-nocheck
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
  });

  // direct return
  /* FIXME(@ai-sdk-upgrade-v5): toDataStreamResponse has been removed. Use a two-step process instead:
  Step 1: const stream = result.toUIMessageStream()
  Step 2: return createUIMessageStreamResponse({ stream, ...options })
  You'll need to import createUIMessageStreamResponse from 'ai'. */
  return result.toDataStreamResponse();
}

export async function handler(req: Request) {
  const stream = streamText({ model, prompt });
  
  // with options
  /* FIXME(@ai-sdk-upgrade-v5): toUIMessageStreamResponse has been removed. Use a two-step process instead:
  Step 1: const stream = result.toUIMessageStream()
  Step 2: return createUIMessageStreamResponse({ stream, ...options })
  You'll need to import createUIMessageStreamResponse from 'ai'. */
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
  
  /* FIXME(@ai-sdk-upgrade-v5): toUIMessageStreamResponse has been removed. Use a two-step process instead:
  Step 1: const stream = result.toUIMessageStream()
  Step 2: return createUIMessageStreamResponse({ stream, ...options })
  You'll need to import createUIMessageStreamResponse from 'ai'. */
  const streamResponse = result.toUIMessageStreamResponse(opts);
  return streamResponse;
}

// conditional return
function conditionalHandler(useStream: boolean) {
  const result = streamText({ model, messages });
  
  if (useStream) {
    /* FIXME(@ai-sdk-upgrade-v5): toDataStreamResponse has been removed. Use a two-step process instead:
    Step 1: const stream = result.toUIMessageStream()
    Step 2: return createUIMessageStreamResponse({ stream, ...options })
    You'll need to import createUIMessageStreamResponse from 'ai'. */
    return result.toDataStreamResponse();
  }
  
  /* FIXME(@ai-sdk-upgrade-v5): toUIMessageStreamResponse has been removed. Use a two-step process instead:
  Step 1: const stream = result.toUIMessageStream()
  Step 2: return createUIMessageStreamResponse({ stream, ...options })
  You'll need to import createUIMessageStreamResponse from 'ai'. */
  return result.toUIMessageStreamResponse({
    sendReasoning: true
  });
}