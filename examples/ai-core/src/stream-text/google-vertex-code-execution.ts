import { vertex } from '@ai-sdk/google-vertex';
import { ModelMessage, streamText, ToolCallPart, ToolResultPart } from 'ai';
import 'dotenv/config';
import * as process from 'process';

const messages: ModelMessage[] = [];
async function main() {
  let toolResponseAvailable = false;

  const result = streamText({
    model: vertex('gemini-2.5-pro'),
    tools: { code_execution: vertex.tools.codeExecution({}) },
    maxOutputTokens: 10000,
    prompt:
      'Calculate 20th fibonacci number. Then find the nearest palindrome to it.',
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
        const transformedDelta: ToolResultPart = {
          ...delta,
          output: { type: 'json', value: delta.output as any },
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
