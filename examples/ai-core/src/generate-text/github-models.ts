import { githubModels } from '@ai-sdk/github-models';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: githubModels('meta/meta-llama-3.1-8b-instruct'),
    prompt: 'I want 100 words on how to inflate a balloon.',
  });

  console.log('Text:');
  console.log(result.text);
  console.log();

  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
