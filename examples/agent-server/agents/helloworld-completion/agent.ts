import type { Agent } from '@ai-sdk/agent-server';
import { Context, contextSchema } from './context.js';

export default {
  // Explicit start method that receives the request, so that the user
  // can perform any data validation, transformation, and loading
  // that is required for their agent.
  // The goal is to provide the initial context for the agent run.
  async start({ request, metadata }) {
    const body = await request.json();

    return {
      context: contextSchema.parse(body),
    };
  },

  // Special states: START, END
  async nextState({ currentState, context }) {
    return currentState === 'START' ? 'main' : 'END';
  },
} satisfies Agent<Context>;
