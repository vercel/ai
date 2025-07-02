import { ModelMessage, streamText } from 'ai';
import 'dotenv/config';
import { tool } from 'ai';
import { z } from 'zod';
import { anthropic } from '@ai-sdk/anthropic';
import { ToolCallPart, ToolResultPart } from 'ai';

// As of Jul 2, 2025 anthropic.com has a beta feature called fine-grained tool
// streaming that skips JSON parsing to reduce latency, but risks returning
// invalid tool input. This test demonstrates the issue with the below flag to
// allow easily toggling the feature. By default we enable the feature to show
// the current behavior.
const enableBetaFineGrainedToolStreaming = true;

async function main() {
  const messages: ModelMessage[] = [];

  const result = streamText({
    model: anthropic('claude-4-sonnet-20250514'),
    maxOutputTokens: 512,
    providerOptions: {
      anthropic: {
        enableBetaFineGrainedToolStreaming,
      },
    },
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z
            .string()
            .nullable()
            .describe('The location to get the weather for'),
        }),
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
