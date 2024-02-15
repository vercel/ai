import {
  CohereStream,
  StreamingTextResponse,
  createStreamDataTransformer,
} from 'ai';
import { CohereClient, Cohere } from 'cohere-ai';

export const runtime = 'edge';

// IMPORTANT! Set the dynamic to force-dynamic
// Prevent nextjs to cache this route
export const dynamic = 'force-dynamic';

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

  const stream = new ReadableStream({
    async start(controller) {
      for await (const event of response) {
        // Stream Events: https://docs.cohere.com/docs/streaming#stream-events
        if (event.eventType === 'text-generation') {
          controller.enqueue(event.text);
        }
      }
      controller.close();
    },
  });

  return new Response(stream);
}
