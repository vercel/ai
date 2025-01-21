import { deepseek } from '@ai-sdk/deepseek';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: deepseek('deepseek-reasoner'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const part of result.fullStream) {
    console.log('part', JSON.stringify(part, null, 2));
  }

  // console.log(result);
  // for await (const textPart of result.textStream) {
  //   console.log('textPart', JSON.stringify(textPart, null, 2));
  //   process.stdout.write(textPart);
  // }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
