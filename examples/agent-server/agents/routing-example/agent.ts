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
    };
  },

  async nextState({ currentState, context }) {
    if (currentState === 'START') {
      return 'router';
    }

    if (context.selectedRoute != null) {
      return context.selectedRoute;
    }

    return 'END';
  },

  headers: { 'X-Vercel-AI-Data-Stream': 'v1' },
} satisfies Agent<Context>;
