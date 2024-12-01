import 'dotenv/config';
import { googleVertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { streamText } from 'ai';

async function main() {
  const result = streamText({
    model: googleVertexAnthropic('claude-3-5-sonnet-20240620'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
