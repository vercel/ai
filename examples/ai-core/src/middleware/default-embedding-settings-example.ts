import { google } from '@ai-sdk/google';
import {
  customProvider,
  defaultEmbeddingSettingsMiddleware,
  embedMany,
  embed,
  wrapEmbeddingModel,
} from 'ai';
import 'dotenv/config';

const centralSpace = customProvider({
  textEmbeddingModels: {
    'powerful-embedding-model': wrapEmbeddingModel({
      model: google.textEmbedding('gemini-embedding-001'),
      middleware: defaultEmbeddingSettingsMiddleware({
        settings: {
          providerOptions: {
            google: {
              outputDimensionality: 256,
              taskType: 'CLASSIFICATION',
            },
          },
        },
      }),
    }),
  },
});
async function main() {
  const embedManyResponse = await embedMany({
    model: centralSpace.textEmbeddingModel('powerful-embedding-model'),
    values: [
      'sunny day at the beach',
      'rainy afternoon in the city',
      'snowy night in the mountains',
    ],
  });
  console.log(embedManyResponse.embeddings);

  const response = await embed({
    model: centralSpace.textEmbeddingModel('powerful-embedding-model'),
    value: 'rainy afternoon in the city',
  });
  console.log(response.embedding);
}

main().catch(console.error);
