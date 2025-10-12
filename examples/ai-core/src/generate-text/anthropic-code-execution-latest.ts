import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  // Using the latest code execution tool with enhanced Bash and file operation support
  const codeExecutionTool = anthropic.tools.codeExecution_20250825();

  const result = await generateText({
    model: anthropic('claude-opus-4-20250514'),
    prompt:
      'Calculate the mean and standard deviation of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] using Python',
    tools: {
      code_execution: codeExecutionTool,
    },
  });

  console.log('Result:', result.text);
  console.log('\nTool Calls:', JSON.stringify(result.toolCalls, null, 2));
  console.log('\nTool Results:', JSON.stringify(result.toolResults, null, 2));
}

main().catch(console.error);
