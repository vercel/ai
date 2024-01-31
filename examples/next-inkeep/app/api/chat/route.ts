import {
  InkeepStream,
  InkeepOnFinalMetadata,
  StreamingTextResponse,
  experimental_StreamData,
} from 'ai';
import { continueChatSession } from './inkeep-api/continueChatSession';
import { createChatSession } from './inkeep-api/createChatSession';

interface ChatRequestBody {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  chat_session_id?: string;
}

const inkeepIntegrationId = process.env.INKEEP_INTEGRATION_ID;

export async function POST(req: Request) {
  const chatRequestBody: ChatRequestBody = await req.json();
  const chatSessionId = chatRequestBody.chat_session_id;

  let response;
  if (!chatSessionId) {
    // new chat session
    response = await createChatSession({
      integration_id: inkeepIntegrationId!,
      chat_session: {
        messages: chatRequestBody.messages,
      },
      stream: true,
    });
  } else {
    // continue chat session
    response = await continueChatSession({
      integration_id: inkeepIntegrationId!,
      chat_session_id: chatSessionId,
      message: chatRequestBody.messages[chatRequestBody.messages.length - 1],
      stream: true,
    });
  }

  // used to pass custom metadata to the client
  const data = new experimental_StreamData();

  if (!response?.body) {
    throw new Error('Response body is null');
  }

  const stream = InkeepStream(response, {
    onRecordsCited: async recordsCited => {
      // append the citations to the message annotations
      data.appendMessageAnnotation({
        recordsCited,
      });
    },
    onFinal: async (complete: string, metadata?: InkeepOnFinalMetadata) => {
      // return the chat_session_id to the client
      if (metadata) {
        data.append({ onFinalMetadata: metadata });
      }
      data.close();
    },
    experimental_streamData: true,
  });

  return new StreamingTextResponse(stream, {}, data);
}
