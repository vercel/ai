import { pruneMessages, type ModelMessage } from 'ai';
import { run } from '../lib/run';

run(async () => {
  for (const summaryCount of [1, 2, 3]) {
    const messages: ModelMessage[] = [
      {
        role: 'assistant',
        content: [
          ...Array.from({ length: summaryCount }, (_, index) => ({
            type: 'reasoning' as const,
            text: `summary ${index}`,
            providerOptions: { openai: { itemId: 'rs_1' } },
          })),
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'lookup',
            input: {},
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'lookup',
            output: { type: 'text', value: 'Tool result.' },
          },
        ],
      },
      { role: 'user', content: 'Continue.' },
    ];

    const pruned = pruneMessages({
      messages,
      toolCalls: 'before-last-message',
    });
    const remainingReasoning = pruned.flatMap(message =>
      message.role === 'assistant' && Array.isArray(message.content)
        ? message.content
            .filter(part => part.type === 'reasoning')
            .map(part => part.text)
        : [],
    );

    console.log(`${summaryCount} summary parts ->`, remainingReasoning);
  }
});
