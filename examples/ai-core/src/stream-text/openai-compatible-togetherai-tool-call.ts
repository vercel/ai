import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, CoreMessage, ToolCallPart, ToolResultPart } from 'ai';
import { weatherTool } from '../tools/weather-tool';

const messages: CoreMessage[] = [];

async function main() {
  let toolResponseAvailable = false;

  const togetherai = createOpenAICompatible({
    baseURL: 'https://api.together.xyz/v1',
    name: 'togetherai',
    headers: {
      Authorization: `Bearer ${process.env.TOGETHER_AI_API_KEY}`,
    },
  });
  const model = togetherai.chatModel(
    'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  );
  const result = streamText({
    model,
    maxTokens: 512,
    tools: {
      weather: weatherTool,
    },
    toolChoice: 'required',
    prompt:
      'What is the weather in San Francisco and what attractions should I visit?',
  });

  let fullResponse = '';
  const toolCalls: ToolCallPart[] = [];
  const toolResponses: ToolResultPart[] = [];

  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'text-delta': {
        fullResponse += delta.textDelta;
        process.stdout.write(delta.textDelta);
        break;
      }

      case 'tool-call': {
        toolCalls.push(delta);

        process.stdout.write(
          `\nTool call: '${delta.toolName}' ${JSON.stringify(delta.args)}`,
        );
        break;
      }

      case 'tool-result': {
        toolResponses.push(delta);

        process.stdout.write(
          `\nTool response: '${delta.toolName}' ${JSON.stringify(
            delta.result,
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
