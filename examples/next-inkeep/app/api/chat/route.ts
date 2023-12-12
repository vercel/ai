import { ParsedEvent, ReconnectInterval, createParser } from 'eventsource-parser';
import { AIStreamParser, InkeepStream, StreamingTextResponse, createEventStreamTransformer } from '../../../../../packages/core/streams';

// Define the type for the request body
interface InkeepApiRequestBody {
  integration_id: string;
  chat_session: {
    messages: Array<{
      role: string;
      content: string[];
    }>;
  };
}

interface UseChatRequestBody {
  messages: Array<{
    role: string;
    content: string[];
  }>;
  data: {
    integration_id: string;
  };
}

if (!process.env.INKEEP_API_KEY) {
  throw new Error('INKEEP_API_KEY is undefined');
}

// examples/next-inkeep/app/api/chat/route.ts
export async function POST(req: Request) {
  const useChatRequestBody: UseChatRequestBody = await req.json();

  const inkeepRequestBody: InkeepApiRequestBody = {
    integration_id: useChatRequestBody.data.integration_id,
    chat_session: {
      messages: useChatRequestBody.messages,
    },
  };

  console.log('Request body:', useChatRequestBody); // Log the request body

  const response = await fetch(
    'https://api.inkeep.com/v1/chat_sessions/chat_results',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.INKEEP_API_KEY}`,
      },
      body: JSON.stringify(inkeepRequestBody),
    },
  );

  console.log('Response:', response); // Log the response

  if (response.body) {
    const stream = InkeepStream(response);
    return new StreamingTextResponse(stream);
  } else {
    console.log('Response body is null');
    throw new Error('Response body is null');
  }
}