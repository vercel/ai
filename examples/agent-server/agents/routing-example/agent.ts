import type { Agent } from '@ai-sdk/agent-server';
import { bodySchema, Context } from './context.js';

export default {
  async start({ request, metadata }) {
    const body = bodySchema.parse(await request.json());
    return {
      context: {
        prompt: body.prompt,
        selectedRoute: null,
      },
      initialState: 'router',
    };
  },

  headers: { 'X-Vercel-AI-Data-Stream': 'v1' },
} satisfies Agent<Context>;
