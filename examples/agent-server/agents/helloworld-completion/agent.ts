import type { Agent } from '@ai-sdk/agent-server';
import { z } from 'zod';

const schema = z.object({
  prompt: z.string(),
});

type Schema = z.infer<typeof schema>;

export default {
  // Explicit start method that receives the request, so that the user
  // can perform any data validation, transformation, and loading
  // that is required for their agent.
  // The goal is to provide the initial context for the agent run.
  async start({ request, metadata }) {
    const body = await request.json();

    return {
      context: schema.parse(body),
    };
  },

  // Special states: START, END
  async nextState({ currentState, context }) {
    return 'main';
  },
} satisfies Agent<Schema>;
