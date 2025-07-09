import { vercel } from '@ai-sdk/vercel';
import { streamText, CoreMessage, ToolCallPart, ToolResultPart } from 'ai';
import 'dotenv/config';
import { weatherTool } from '../tools/weather-tool';

const messages: CoreMessage[] = [];

async function main() {
  let toolResponseAvailable = false;

  const result = streamText({
    model: vercel('v0-1.0-md'),
<<<<<<< HEAD
    maxTokens: 512,
=======
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
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

<<<<<<< HEAD
  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'text-delta': {
        fullResponse += delta.textDelta;
        process.stdout.write(delta.textDelta);
=======
  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text': {
        process.stdout.write(chunk.text);
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
        break;
      }

      case 'tool-call': {
<<<<<<< HEAD
        toolCalls.push(delta);

        process.stdout.write(
          `\nTool call: '${delta.toolName}' ${JSON.stringify(delta.args)}`,
=======
        console.log(
          `TOOL CALL ${chunk.toolName} ${JSON.stringify(chunk.input)}`,
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
        );
        break;
      }

      case 'tool-result': {
<<<<<<< HEAD
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
=======
        console.log(
          `TOOL RESULT ${chunk.toolName} ${JSON.stringify(chunk.output)}`,
        );
        break;
      }

      case 'finish-step': {
        console.log();
        console.log();
        console.log('STEP FINISH');
        console.log('Finish reason:', chunk.finishReason);
        console.log('Usage:', chunk.usage);
        console.log();
        break;
      }

      case 'finish': {
        console.log('FINISH');
        console.log('Finish reason:', chunk.finishReason);
        console.log('Total Usage:', chunk.totalUsage);
        break;
      }

      case 'error':
        console.error('Error:', chunk.error);
        break;
    }
  }
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
}

main().catch(console.error);
