import 'dotenv/config';
import { vertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { generateText } from 'ai';
import { z } from 'zod';

async function main() {
  const result = await generateText({
    model: vertexAnthropic('claude-sonnet-4-5@20250929'),
    prompt: 'Say Hi',
  });

  console.log(JSON.stringify(result, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
