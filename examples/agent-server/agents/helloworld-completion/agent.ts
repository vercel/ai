import type { Agent } from '@ai-sdk/agent-server';

export default {
  async init({ request, metadata }) {
    return {
      context: {
        bla: 'bla',
      },
    };
  },
} satisfies Agent<{ bla: string }>;
