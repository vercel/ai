// Offline reproduction of raw string arguments, BigInt, and shared/cyclic
// references at the provider interface; no API key or provider call is needed.
import { createOpenAI } from '@ai-sdk/openai';
import { run } from '../lib/run';

run(async () => {
  const provider = createOpenAI({
    apiKey: 'test-api-key',
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      console.log(body.messages[0].tool_calls[0].function.arguments);
      return Response.json({
        id: 'chatcmpl-test',
        created: 0,
        model: 'gpt-4.1',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'OK' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    },
  });
  const shared = { value: 42 };
  const input: Record<string, unknown> = {
    first: shared,
    second: shared,
    count: 42n,
  };
  input.self = input;

  for (const args of ['{ "city": "Tokyo" }', input]) {
    await provider.chat('gpt-4.1').doGenerate({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call1',
              toolName: 'inspect',
              input: args,
            },
          ],
        },
      ],
    });
  }
});
