import { bedrock } from '@ai-sdk/amazon-bedrock';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: bedrock(
      'arn:aws:bedrock:us-east-2:474668406012:inference-profile/us.anthropic.claude-3-5-sonnet-20240620-v1:0',
    ),
    maxTokens: 1000,
    temperature: 0.5,
    prompt: 'Give me an overview of the New Zealand Fiordland National Park.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
