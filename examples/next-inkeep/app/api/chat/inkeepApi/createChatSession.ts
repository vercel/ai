import { InkeepMessage } from 'ai/streams';
import { InkeepApiClient } from './inkeepClient';

// Define the type for the request body
export interface CreateChatSessionInput {
  integration_id: string;
  chat_mode?: 'turbo' | 'auto'; // default: 'auto'
  chat_session: {
    messages: Array<InkeepMessage>;
  };
  stream?: boolean;
}

interface CreateChatSessionArgs {
  input: CreateChatSessionInput;
  client: InkeepApiClient;
}

export async function createChatSession({
  input,
  client,
}: CreateChatSessionArgs) {
  // Send the request to the Inkeep API
  const response = await client.fetch({
    path: '/chat_sessions/chat_results',
    body: input,
    options: {
      method: 'POST',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response;
}
