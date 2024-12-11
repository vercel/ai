import { agenticTask } from '@ai-sdk/agent-server';
import { openai } from '@ai-sdk/openai';

export default agenticTask({
  model: openai('gpt-4o'),
  instruction:
    'You are an outstanding writer. ' +
    'Write a blog post. ' +
    'The blog post MUST BE at least 4 paragraphs long. ',
  finalize: async () => ({ nextTask: 'END' }),
});
