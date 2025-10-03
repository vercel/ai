import { bedrock } from '@ai-sdk/amazon-bedrock';
import { stepCountIs, streamText, ToolCallPart, ToolResultPart } from 'ai';
import 'dotenv/config';
import { weatherTool } from '../tools/weather-tool';

async function main() {
  const result = streamText({
    model: bedrock('us.anthropic.claude-3-7-sonnet-20250219-v1:0'),
    tools: {
      weather: weatherTool,
    },
    prompt: 'What is the weather in San Francisco?',
    providerOptions: {
      bedrock: {
        reasoningConfig: { type: 'enabled', budgetTokens: 1024 },
      },
    },
    stopWhen: stepCountIs(5),
    maxRetries: 5,
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
