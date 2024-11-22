import type { Agent } from '@ai-sdk/agent-server';
import { Message } from 'ai';

export type Context = { messages: Message[] };

export default {
  async start({ request }) {
    return {
      context: (await request.json()) as Context,
      initialState: 'router',
    };
  },
  headers: { 'X-Vercel-AI-Data-Stream': 'v1' },
} satisfies Agent<Context>;
