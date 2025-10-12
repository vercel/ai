import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  // Using the latest code execution tool with enhanced Bash and file operation support
  const codeExecutionTool = anthropic.tools.codeExecution_20250825();

  const result = streamText({
    model: anthropic('claude-opus-4-20250514'),
    prompt:
      'Write a Python script to calculate fibonacci numbers and then execute it to find the 10th fibonacci number',
    tools: {
      code_execution: codeExecutionTool,
    },
  });

  process.stdout.write('\nAssistant: ');

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta': {
        process.stdout.write(part.text);
        break;
      }

      case 'tool-call': {
        process.stdout.write(
          `\n\nTool call: '${part.toolName}'\nInput: ${JSON.stringify(part.input, null, 2)}\n`,
        );
        break;
      }

      case 'tool-result': {
        process.stdout.write(
          `\nTool result: '${part.toolName}'\nOutput: ${JSON.stringify(part.output, null, 2)}\n`,
        );
        break;
      }

      case 'error': {
        console.error('\n\nCode execution error:', part.error);
        break;
      }
    }
  }

  process.stdout.write('\n\n');
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
}

main().catch(console.error);
