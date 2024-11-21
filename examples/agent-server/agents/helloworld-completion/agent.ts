import type { Agent } from '@ai-sdk/agent-server';

export default {
  async init() {
    // log current node directory (for debugging purposes)
    console.log('Hello World!', process.cwd());
  },
} satisfies Agent;
