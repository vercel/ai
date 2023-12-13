import {
  ParsedEvent,
  ReconnectInterval,
  createParser,
} from 'eventsource-parser';
import {
  AIStreamParser,
  InkeepCompleteMessage,
  InkeepStream,
  StreamingTextResponse,
  createEventStreamTransformer,
  experimental_StreamData,
} from '../../../../../packages/core/streams';
import { z } from 'zod';
import {
  ContinueChatInput,
  CreateChatSessionInput,
  InkeepApiClient,
  continueChat,
  createChatSession,
} from './inkeepApi';

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

interface ChatRequestBody {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  data?: {
    chat_session_id?: string;
  };
}

const inkeepApiKey = process.env.INKEEP_API_KEY;
const inkeepIntegrationId = process.env.INKEEP_INTEGRATION_ID;

if (!inkeepApiKey || !inkeepIntegrationId) {
  throw new Error('Inkeep identifiers undefined');
}

export const InkeepChatResultCustomDataSchema = z
  .object({
    chat_session_id: z.string().optional(),
    // include other properties as needed
  })
  .optional();

export type InkeepChatResultCustomData = z.infer<
  typeof InkeepChatResultCustomDataSchema
>;

const client = new InkeepApiClient(inkeepApiKey);

// examples/next-inkeep/app/api/chat/route.ts
export async function POST(req: Request) {
  const chatRequestBody: ChatRequestBody = await req.json();

  let response;
  if (!chatRequestBody.data?.chat_session_id) {
    // new chat session
    response = await createChatSession({
      input: {
        integration_id: inkeepIntegrationId!,
        chat_session: {
          messages: chatRequestBody.messages,
        },
      },
      client,
    });
  } else {
    // continue chat session
    response = await continueChat({
      input: {
        integration_id: inkeepIntegrationId!,
        chat_session_id: chatRequestBody.data.chat_session_id,
        message: chatRequestBody.messages[chatRequestBody.messages.length - 1],
      },
      client,
    });
  }

  // data is used to pass custom metadata to the client, like chat_session_id
  const data = new experimental_StreamData();

  if (!response?.body) {
    throw new Error('Response body is null');
  }

  const stream = InkeepStream(response, {
    onFinal: (completion: string) => {
      data.close();
    },
    onCompleteMessage: (finalMessageContent: InkeepCompleteMessage) => {
      const chat_session_id = finalMessageContent.chat_session_id;
      if (chat_session_id) {
        const chatData: InkeepChatResultCustomData = {
          chat_session_id,
        };
        data.append(chatData);
      } else {
        throw new Error('Chat session id is undefined');
      }
    },
    experimental_streamData: true,
  });

  return new StreamingTextResponse(stream, {}, data);
}
