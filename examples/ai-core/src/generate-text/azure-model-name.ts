import { azure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const model = azure(
    'gpt-nano-flex', // Replace 'gpt-nano-flex' with your actual deployment name
    {
      modelName: 'gpt-4.1-nano', // and specify the underlying model ex. for telemetry
    },
  );

  const { text, usage } = await generateText({
    model,
    prompt: 'Why is the sky blue?',
  });

  console.log('Model ID:', model.modelId);
  console.log(text);
  console.log(usage);
}

main().catch(console.error);
