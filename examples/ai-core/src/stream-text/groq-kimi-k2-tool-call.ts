import { groq } from '@ai-sdk/groq';
import { streamText, ModelMessage, ToolCallPart, ToolResultPart } from 'ai';
import 'dotenv/config';
import { weatherTool } from '../tools/weather-tool';

const messages: ModelMessage[] = [];

async function main() {
  let toolResponseAvailable = false;

  const result = streamText({
    model: groq('moonshotai/kimi-k2-instruct'),
    maxOutputTokens: 512,
    tools: {
      weather: weatherTool,
    },
    toolChoice: 'auto',
    prompt: 'What is the weather in San Francisco?',
  });

  let fullResponse = '';
  const toolCalls: ToolCallPart[] = [];
  const toolResponses: ToolResultPart[] = [];

  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'text-delta': {
        fullResponse += delta.text;
        process.stdout.write(delta.text);
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
        if (delta.dynamic) {
          continue;
        }

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

  toolResponseAvailable = toolCalls.length > 0;
  console.log('Messages:', messages[0].content);
}

main().catch(console.error);
