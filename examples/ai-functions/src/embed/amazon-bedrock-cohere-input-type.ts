import { bedrock } from '@ai-sdk/amazon-bedrock';
import { embed } from 'ai';
import { run } from '../lib/run';

run(async () => {
  // Use 'search_document' for documents to be searched,
  // and 'search_query' for search queries (default).
  const { embedding, usage, warnings } = await embed({
    model: bedrock.embedding('cohere.embed-english-v3'),
    value: 'sunny day at the beach',
    providerOptions: {
      bedrock: {
        inputType: 'search_document',
      },
    },
  });

  console.log(embedding);
  console.log(usage);
  console.log(warnings);
});
