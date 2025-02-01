import { bedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import 'dotenv/config';

// - nova lite | amazon.nova-lite-v1:0
// - claude 3.5 sonnet | arn:aws:bedrock:us-east-2:474668406012:inference-profile/us.anthropic.claude-3-5-sonnet-20240620-v1:0
// - claude 3.5 sonnet v2 | arn:aws:bedrock:us-east-2:474668406012:inference-profile/us.anthropic.claude-3-5-sonnet-20241022-v2:0
// - llama 3.2 11B vision instruct | arn:aws:bedrock:us-east-2:474668406012:inference-profile/us.meta.llama3-2-11b-instruct-v1:0

async function main() {
  const result = await generateText({
    model: bedrock(
      'arn:aws:bedrock:us-east-2:474668406012:inference-profile/us.amazon.nova-lite-v1:0',
      // 'arn:aws:bedrock:us-east-2:474668406012:inference-profile/us.anthropic.claude-3-5-sonnet-20240620-v1:0',
    ),
    maxTokens: 1000,
    temperature: 0.5,
    prompt: 'Give me an overview of the New Zealand Fiordland National Park.',
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
