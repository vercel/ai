import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import 'dotenv/config';

/**
 * prepare
 * Please add parameters in your .env file for initialize Azure OpenAI..
 * AZURE_RESOURCE_NAME="<your_resource_name>"
 * AZURE_API_KEY="<your_api_key>"
 */


async function main() {
  // Basic text generation
  const result = streamText({
    model: azure.responses('gpt-5-mini'),
    prompt: 'Create a program that generates five random numbers between 1 and 100 with two decimal places, and show me the execution results.',
    tools: {
      code_interpreter: azure.tools.codeInterpreter({
      }),
    },
  });

  console.log('\n=== Basic Text Generation ===');
  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
  console.log('\n=== Other Outputs ===');
  console.log(await result.toolCalls);
  console.log(await result.toolResults);  
}

main().catch(console.error);
