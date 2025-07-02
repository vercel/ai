import { ModelMessage, streamText } from 'ai';
import 'dotenv/config';
import { tool } from 'ai';
import { z } from 'zod';
import { createAnthropic } from '@ai-sdk/anthropic';
import { ToolCallPart, ToolResultPart } from 'ai';

// With this schema, enabling fine-grained tool streaming breaks the tool call.
const dangerouslyEnableFineGrainedToolStreaming = true;

async function main() {
  const anthropic = createAnthropic({
    dangerouslyEnableFineGrainedToolStreaming,
  });

  const messages: ModelMessage[] = [];

  const result = streamText({
    model: anthropic('claude-4-sonnet-20250514'),
    maxOutputTokens: 512,
    tools: {
      // @ts-ignore type error from different zod versions
      weather: tool({
        description: 'Get the weather in a location',
        // @ts-ignore type error from different zod versions
        inputSchema: z.object({
          location: z.string().nullable().describe('The location to get the weather for'),
        }),
        // location below is inferred to be a string:
        execute: async ({ location }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }),
      }),
    },
    prompt:
      'What is the weather in San Francisco and what attractions should I visit?',
  });

  let fullResponse = '';
  const toolCalls: ToolCallPart[] = [];
  const toolResponses: ToolResultPart[] = [];

  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'text': {
        fullResponse += delta.text;
        break;
      }

      case 'tool-call': {
        toolCalls.push(delta);

        process.stdout.write(
          `\nTool call: '${delta.toolName}' ${JSON.stringify(delta.input)}`,
        );
        break;
      }

      case 'tool-result': {
        // Transform to new format
        const transformedDelta: ToolResultPart = {
          ...delta,
          output: { type: 'json', value: delta.output },
        };
        toolResponses.push(transformedDelta);

        process.stdout.write(
          `\nTool response: '${delta.toolName}' ${JSON.stringify(
            delta.output,
          )}`,
        );
        break;
      }
    }
  }
  process.stdout.write('\n\n');

  messages.push({
    role: 'assistant',
    content: [{ type: 'text', text: fullResponse }, ...toolCalls],
  });

  if (toolResponses.length > 0) {
    messages.push({ role: 'tool', content: toolResponses });
  }
}

main().catch(console.error);
