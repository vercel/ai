import type { Agent } from '@ai-sdk/agent-server';
import { Context, contextSchema } from './context.js';

export default {
  async start({ request }) {
    return {
      context: contextSchema.parse(await request.json()),
      initialState: 'main',
    };
  },
  headers: { 'X-Vercel-AI-Data-Stream': 'v1' },
} satisfies Agent<Context>;
