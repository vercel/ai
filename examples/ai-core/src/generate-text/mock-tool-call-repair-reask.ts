import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const result = await generateText({
    model: new MockLanguageModelV2({
      doGenerate: async () => ({
        warnings: [],
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
        },
        finishReason: 'tool-calls',
        content: [
          {
            type: 'tool-call',
            toolCallType: 'function',
            toolCallId: 'call-1',
            toolName: 'cityAttractions',
            // wrong tool call arguments (city vs cities):
            input: `{ "city": "San Francisco" }`,
          },
        ],
      }),
    }),
    tools: {
      cityAttractions: tool({
        inputSchema: z.object({ cities: z.array(z.string()) }),
      }),
    },
    prompt: 'What are the tourist attractions in San Francisco?',

    experimental_repairToolCall: async ({
      toolCall,
      tools,
      error,
      messages,
      system,
    }) => {
      const result = await generateText({
        model: openai('gpt-4o'),
        system,
        messages: [
          ...messages,
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                input: toolCall.input,
              },
            ],
          },
          {
            role: 'tool' as const,
            content: [
              {
                type: 'tool-result',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                output: { type: 'error-text', value: error.message },
              },
            ],
          },
        ],
        tools,
      });

      const newToolCall = result.toolCalls.find(
        newToolCall => newToolCall.toolName === toolCall.toolName,
      );

      return newToolCall != null
        ? {
            type: 'tool-call' as const,
            toolCallType: 'function' as const,
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            input: JSON.stringify(newToolCall.input),
          }
        : null;
    },
  });

  console.log('Repaired tool calls:');
  console.log(JSON.stringify(result.toolCalls, null, 2));
}

main().catch(console.error);
