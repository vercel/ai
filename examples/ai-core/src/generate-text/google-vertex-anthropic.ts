import 'dotenv/config';
import { vertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    // model: vertexAnthropic('claude-3-5-sonnet-v2@20241022'),
    model: vertexAnthropic('claude-3-5-sonnet-v2@20241022'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
