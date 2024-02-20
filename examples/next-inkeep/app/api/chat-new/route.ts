import { streamMessage, ChatMessages } from 'ai';
import { inkeep } from 'ai/provider';

interface ChatRequestBody {
  messages: ChatMessages;
  chatSessionId?: string;
}

const inkeepIntegrationId = process.env.INKEEP_INTEGRATION_ID!;

export async function POST(req: Request) {
  const chatRequestBody: ChatRequestBody = await req.json();

  const messageStream = await streamMessage({
    model: inkeep.chat({
      integrationId: inkeepIntegrationId,
      chatSessionId: chatRequestBody.chatSessionId,
    }),
    prompt: chatRequestBody.messages,
  });

  return messageStream.toStreamingResponse();
}
