import { generateText, type ModelMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { run } from '../../lib/run';

const messages = [
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'document-lookup',
        toolName: 'lookupDocument',
        input: {},
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'document-lookup',
        toolName: 'lookupDocument',
        output: {
          type: 'content',
          value: [
            {
              type: 'file',
              mediaType: 'application/pdf',
              data: {
                type: 'reference',
                reference: {
                  openai: 'file_openai_123',
                  anthropic: 'file_anthropic_123',
                },
              },
            },
          ],
        },
      },
    ],
  },
] satisfies ModelMessage[];

run(async () => {
  const result = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: async ({ prompt }) => {
        const toolMessage = prompt.find(message => message.role === 'tool');
        console.dir(toolMessage, { depth: null });

        return {
          content: [
            { type: 'text', text: 'The referenced document is ready.' },
          ],
          finishReason: { raw: undefined, unified: 'stop' },
          usage: {
            inputTokens: {
              total: 10,
              noCache: 10,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 6,
              text: 6,
              reasoning: undefined,
            },
          },
          warnings: [],
        };
      },
    }),
    messages,
  });

  console.log(result.text);
});
