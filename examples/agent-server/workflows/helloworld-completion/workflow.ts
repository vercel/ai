import { workflow } from '@ai-sdk/agent-server';
import { z } from 'zod';

export const inputSchema = z.object({ prompt: z.string() });

export default workflow({
  // Explicit start method that receives the request, so that the user
  // can perform any data validation, transformation, and loading
  // that is required for their workflow.
  //
  // The goal is to provide the initial task, context, and messages
  // for the workflow run.
  async start({ request }) {
    const input = inputSchema.parse(await request.json());
    return {
      messages: [{ role: 'user', content: input.prompt }],
      initialTask: 'main',
    };
  },

  // Optional stream headers. Streams can be anything JSON-serializable,
  // so we enable workflows to set the headers that are needed.
  headers: {
    'X-Vercel-AI-Data-Stream': 'v1',
    // CORS headers for access from Next.js app
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS, GET, POST',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400', // 24 hours
  },
});
