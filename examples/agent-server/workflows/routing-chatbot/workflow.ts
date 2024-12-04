import type { Workflow } from '@ai-sdk/agent-server';
import { Message } from 'ai';

export type Context = { messages: Message[] };

export default {
  async start({ request }) {
    return {
      context: (await request.json()) as Context,
      initialTask: 'router',
    };
  },
  headers: {
    'X-Vercel-AI-Data-Stream': 'v1',
    // CORS headers for access from Next.js app
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS, GET, POST',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400', // 24 hours
  },
} satisfies Workflow<Context>;
