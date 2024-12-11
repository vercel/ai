import { agenticTask } from '@ai-sdk/agent-server';
import { openai } from '@ai-sdk/openai';

export default agenticTask({
  model: openai('gpt-4o'),
  instruction: 'You are a friendly chatbot. Respond briefly and concisely.',
  finalize: async () => ({ nextTask: 'END' }),
});
