import { InkeepMessage } from 'ai/streams';

// The type for the request body
export interface ContinueChatInput {
  integration_id: string;
  chat_session_id: string;
  message: InkeepMessage;
  stream?: boolean;
}

export async function continueChatSession({
  integration_id,
  chat_session_id,
  message,
  stream,
}: ContinueChatInput) {
  const body = JSON.stringify({
    integration_id,
    chat_session_id,
    message,
    stream,
  });

  const response = await fetch(
    `https://api.inkeep.com/v0/chat_sessions/${chat_session_id}/chat_results`,
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
