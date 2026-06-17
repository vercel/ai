import { tool } from 'ai';

const weather = tool({
  inputSchema: {} as any,
  execute: async (input, { context: experimental_context }) => {
    return experimental_context;
  },
});
