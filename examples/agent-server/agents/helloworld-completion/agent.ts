import type { Agent } from '@ai-sdk/agent-server';
import { z } from 'zod';

// agent context is available to all states.
// it can be used to pass data between states.
export const contextSchema = z.object({ prompt: z.string() });
export type Context = z.infer<typeof contextSchema>;

export default {
  // Explicit start method that receives the request, so that the user
  // can perform any data validation, transformation, and loading
  // that is required for their agent.
  // The goal is to provide the initial context for the agent run.
  async start({ request, metadata }) {
    return {
      context: contextSchema.parse(await request.json()),
      initialState: 'main',
    };
  },

  // Optional headers. Streams can be anything JSON-serializable,
  // so we enable agents to set the headers that are needed.
  headers: { 'X-Vercel-AI-Data-Stream': 'v1' },
} satisfies Agent<Context>;
