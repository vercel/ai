import { workflow } from '@ai-sdk/agent-server';
import { z } from 'zod';

export const contextSchema = z.object({ prompt: z.string() });
export type Context = z.infer<typeof contextSchema>;

export default workflow({
  async start({ request }) {
    return {
      context: contextSchema.parse(await request.json()),
      initialTask: '1',
    };
  },
  headers: {
    'X-Vercel-AI-Data-Stream': 'v1',
  },
});
