import { anthropic } from '@ai-sdk/anthropic';
import {
  extractReasoningMiddleware,
  stepCountIs,
  streamText,
  ToolCallPart,
  ToolResultPart,
  wrapLanguageModel,
} from 'ai';
import 'dotenv/config';
import { weatherTool } from '../tools/weather-tool';

async function main() {
  const result = streamText({
    model: wrapLanguageModel({
      model: anthropic('claude-3-opus-20240229'),
      middleware: [extractReasoningMiddleware({ tagName: 'thinking' })],
    }),
    providerOptions: {
      anthropic: {
        // Anthropic produces 'thinking' tags for this model and example
        // configuration.  These will never include signature content and so
        // will fail the provider-side signature check if included in subsequent
        // request messages, so we disable sending reasoning content.
        sendReasoning: false,
      },
    },
    tools: {
      weather: weatherTool,
    },
    prompt: 'What is the weather in San Francisco?',
    stopWhen: stepCountIs(5),
  });

  let enteredReasoning = false;
  let enteredText = false;
  const toolCalls: ToolCallPart[] = [];
  const toolResponses: ToolResultPart[] = [];

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'reasoning-delta': {
        if (!enteredReasoning) {
          enteredReasoning = true;
          console.log('\nREASONING:\n');
        }
        process.stdout.write(part.text);
        break;
      }

      case 'text-delta': {
        if (!enteredText) {
          enteredText = true;
          console.log('\nTEXT:\n');
        }
        process.stdout.write(part.text);
        break;
      }

      case 'tool-call': {
        toolCalls.push(part);

        process.stdout.write(
          `\nTool call: '${part.toolName}' ${JSON.stringify(part.input)}`,
        );
        break;
      }

      case 'tool-result': {
        if (part.dynamic) {
          continue;
        }

        const transformedPart: ToolResultPart = {
          ...part,
          output: { type: 'json', value: part.output },
        };
        toolResponses.push(transformedPart);

        process.stdout.write(
          `\nTool response: '${part.toolName}' ${JSON.stringify(part.output)}`,
        );
        break;
      }
    }
  }
}

main().catch(console.error);
