import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  // Basic text generation
  const basicResult = await generateText({
    model: openai.responses('gpt-4.1-mini'),
    prompt:
      'Create a program that generates five random numbers between 1 and 100 with two decimal places, and show me the execution results. Also save the result to a file.',
    tools: {
      code_interpreter: openai.tools.codeInterpreter({}),
    },
  });

  console.log('\n=== Basic Text Generation ===');
  console.log(basicResult.text);
  console.log('\n=== Other Outputs ===');
  console.log(basicResult.toolCalls);
  console.log(basicResult.toolResults);
  console.log('\n=== Code Interpreter Annotations ===');
  for (const part of basicResult.content) {
    if (part.type === 'text') {
      const annotations = part.providerMetadata?.openai?.annotations;
      if (annotations) {
        console.dir(annotations);
      }
    }
  }
}

main().catch(console.error);
