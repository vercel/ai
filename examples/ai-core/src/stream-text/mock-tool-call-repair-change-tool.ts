import { streamText, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV2 } from 'ai/test';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamText({
    model: new MockLanguageModelV2({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallType: 'function',
            toolCallId: 'call-1',
            toolName: 'attractions', // wrong tool name
            input: `{ "city": "San Francisco" }`,
          },
          {
            type: 'finish',
            finishReason: 'tool-calls',
            logprobs: undefined,
            usage: {
              inputTokens: 3,
              outputTokens: 10,
              totalTokens: 13,
            },
          },
        ]),
      }),
    }),
    tools: {
      cityAttractions: tool({
        inputSchema: z.object({ city: z.string() }),
      }),
    },
    prompt: 'What are the tourist attractions in San Francisco?',

    experimental_repairToolCall: async ({ toolCall }) => {
      return toolCall.toolName === 'attractions'
        ? {
            type: 'tool-call' as const,
            toolCallType: 'function' as const,
            toolCallId: toolCall.toolCallId,
            toolName: 'cityAttractions',
            input: toolCall.input,
          }
        : null;
    },
  });

  for await (const part of result.fullStream) {
    console.log(JSON.stringify(part, null, 2));
  }

  console.log('Repaired tool calls:');
  console.log(JSON.stringify(await result.toolCalls, null, 2));
}

main().catch(console.error);
