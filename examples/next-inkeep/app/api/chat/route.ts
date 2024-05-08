import {
  InkeepStream,
  InkeepOnFinalMetadata,
  StreamingTextResponse,
  StreamData,
} from 'ai';
import { InkeepAI } from '@inkeep/ai-api';
import type { RecordsCited$ } from '@inkeep/ai-api/models/components';

interface ChatRequestBody {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  chat_session_id?: string;
}

const inkeepIntegrationId = process.env.INKEEP_INTEGRATION_ID!;

export async function POST(req: Request) {
  const chatRequestBody: ChatRequestBody = await req.json();
  const chat_session_id = chatRequestBody.chat_session_id;

  const ikpClient = new InkeepAI({
    apiKey: process.env.INKEEP_API_KEY,
  });

  let response;

  if (!chat_session_id) {
    const createRes = await ikpClient.chatSession.create({
      integrationId: inkeepIntegrationId,
      chatSession: {
        messages: chatRequestBody.messages,
      },
      stream: true,
    });

    response = createRes.rawResponse;
  } else {
    const continueRes = await ikpClient.chatSession.continue(chat_session_id, {
      integrationId: inkeepIntegrationId,
      message: chatRequestBody.messages[chatRequestBody.messages.length - 1],
      stream: true,
    });

    response = continueRes.rawResponse;
  }

  // used to pass custom metadata to the client
  const data = new StreamData();

  if (!response?.body) {
    throw new Error('Response body is null');
  }

  const stream = InkeepStream(response, {
    onRecordsCited: async (records_cited: RecordsCited$.Inbound) => {
      // append the citations to the message annotations
      data.appendMessageAnnotation({
        records_cited,
      });
    },
    onFinal: async (complete: string, metadata?: InkeepOnFinalMetadata) => {
      // return the chat_session_id to the client
      if (metadata) {
        data.append({ onFinalMetadata: metadata });
      }
      data.close();
    },
  });

  return new StreamingTextResponse(stream, {}, data);
}
