import { InkeepMessage } from 'ai/streams';

// The type for the request body
export interface CreateChatSessionArgs {
  integration_id: string;
  chat_mode?: 'turbo' | 'auto'; // default: 'auto'
  chat_session: {
    messages: Array<InkeepMessage>;
  };
  stream?: boolean;
}

export async function createChatSession({
  integration_id,
  chat_mode,
  chat_session,
  stream,
}: CreateChatSessionArgs) {
  const body = JSON.stringify({
    integration_id,
    chat_mode,
    chat_session,
    stream,
  });

  const response = await fetch(
    'https://api.inkeep.com/v0/chat_sessions/chat_results',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.INKEEP_API_KEY}`,
      },
      body,
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response;
}
