import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: openai.responses('gpt-5-nano'),
    tools: {
      code_interpreter: openai.tools.codeInterpreter(),
    },
    prompt:
      'Simulate rolling two dice 10000 times and and return the sum all the results.',
    // includeRawChunks: true,
  });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'raw': {
        console.log('Raw chunk:', JSON.stringify(chunk.rawValue));
        break;
      }

      case 'text-delta': {
        process.stdout.write(chunk.text);
        break;
      }

      case 'tool-call': {
        console.log('Tool call:', JSON.stringify(chunk, null, 2));
        break;
      }

      case 'tool-result': {
        console.log('Tool result:', JSON.stringify(chunk, null, 2));
        break;
      }

      case 'error':
        console.error('Error:', chunk.error);
        break;
    }
  }
}

main().catch(console.error);
