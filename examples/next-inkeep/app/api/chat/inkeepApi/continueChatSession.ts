import { InkeepMessage } from 'ai/streams';
import { InkeepApiClient } from './inkeepClient';

// Define the type for the request body
export interface ContinueChatInput {
  integration_id: string;
  chat_session_id: string;
  message: InkeepMessage;
  stream?: boolean;
}

interface ContinueChatArgs {
  input: ContinueChatInput;
  client: InkeepApiClient;
}

export async function continueChat({ input, client }: ContinueChatArgs) {
  const response = await client.fetch({
    path: `/chat_sessions/${input.chat_session_id}/chat_results`,
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
