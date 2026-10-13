import { pruneMessages, type ModelMessage } from 'ai';

async function main() {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: 'What is the weather in Paris?',
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'I will check the weather.',
        },
        {
          type: 'tool-call',
          toolCallId: 'weather-call',
          toolName: 'getWeather',
          input: { city: 'Paris' },
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'weather-call',
          toolName: 'getWeather',
          output: { type: 'text', value: 'Sunny' },
        },
      ],
    },
    {
      role: 'assistant',
      content: 'It is sunny in Paris.',
    },
  ];

  const runtimeCount: number = Number('0');
  const runtimeStrategy: `before-last-${number}-messages` = `before-last-${runtimeCount}-messages`;

  const expected = pruneMessages({
    messages,
    toolCalls: 'all',
  });
  const actual = pruneMessages({
    messages,
    toolCalls: runtimeStrategy,
  });

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      'ISSUE_21722_REPRODUCED: before-last-0-messages retained tool calls and results instead of pruning them like all',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
