import { experimental_generateText } from 'ai';
import { Mistral } from 'ai/mistral';
import dotenv from 'dotenv';

dotenv.config();

const mistral = new Mistral();

async function main() {
  const result = await experimental_generateText({
    model: mistral.chat('open-mistral-7b'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
