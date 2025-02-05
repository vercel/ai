import { bedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: bedrock(
      `arn:aws:bedrock:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:inference-profile/us.anthropic.claude-3-5-sonnet-20240620-v1:0`,
    ),
    prompt: 'Give me an overview of the New Zealand Fiordland National Park.',
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log('Response headers:', result.response.headers);
}

main().catch(console.error);
