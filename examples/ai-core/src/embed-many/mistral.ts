import { mistral } from '@ai-sdk/mistral';
import { embedMany } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await embedMany({
    model: mistral.embedding('mistral-embed'),
    values: [
      'sunny day at the beach',
      'rainy afternoon in the park',
      'cold night under the stars',
    ],
  });

  console.log(result);
}

main().catch(console.error);
