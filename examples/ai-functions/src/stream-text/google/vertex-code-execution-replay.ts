import { createGoogleVertex } from '@ai-sdk/google-vertex';
import { streamText, tool } from 'ai';
import { z } from 'zod/v4';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

const googleVertex = createGoogleVertex({ location: 'global' });

const tools = {
  code_execution: googleVertex.tools.codeExecution({}),
  listItems: tool({
    description: 'List the available items.',
    inputSchema: z.object({}),
    execute: async () => ({ items: ['a', 'b'] }),
  }),
};

const prompt =
  'Invoke both tools in this response: calculate 17 * 19 with code execution and call listItems exactly once.';

run(async () => {
  const first = streamText({
    model: googleVertex('gemini-3-flash-preview'),
    tools,
    prompt,
    maxRetries: 0,
  });

  await first.consumeStream();

  const firstTurnMessages = (await first.response).messages;
  const firstTurnJson = JSON.stringify(firstTurnMessages);

  if (
    !firstTurnJson.includes('code_execution') ||
    !firstTurnJson.includes('listItems')
  ) {
    throw new Error(
      'Gemini did not call both tools, so the replay scenario was not reached.',
    );
  }

  print('First turn messages:', firstTurnMessages);

  const second = streamText({
    model: googleVertex('gemini-3-flash-preview'),
    tools,
    messages: [
      { role: 'user', content: prompt },
      ...firstTurnMessages,
      { role: 'user', content: 'Now calculate 23 * 29 with code execution.' },
    ],
    maxRetries: 0,
  });

  await second.consumeStream();

  print('Second turn finish reason:', await second.finishReason);
});
