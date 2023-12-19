import { CohereStream, StreamingTextResponse } from 'ai';
import { CohereClient, Cohere } from 'cohere-ai';

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge';

if (!process.env.COHERE_API_KEY) {
  throw new Error('Missing COHERE_API_KEY environment variable');
}

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

const toCohereRole = (role: string): Cohere.ChatMessageRole => {
  if (role === 'user') {
    return Cohere.ChatMessageRole.User;
  }
  return Cohere.ChatMessageRole.Chatbot;
};

export async function POST(req: Request) {
  // Extract the `messages` from the body of the request
  const { messages } = await req.json();
  const chatHistory = messages.map((message: any) => ({
    message: message.content,
    role: toCohereRole(message.role),
  }));
  const lastMessage = chatHistory.pop();

  const response = await cohere.chatStream({
    message: lastMessage.message,
    chatHistory,
  });

  const stream = CohereStream(response);

  // Respond with the stream
  return new StreamingTextResponse(stream);
}
