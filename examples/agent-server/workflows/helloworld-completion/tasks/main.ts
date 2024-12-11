import { agenticTask } from '@ai-sdk/agent-server';
import { openai } from '@ai-sdk/openai';

export default agenticTask<null>({
  model: openai('gpt-4o'),
  finalize: () => ({ nextTask: 'END' }),
});
