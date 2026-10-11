import type {
  EmbeddingModelV4,
  Experimental_BatchV4 as BatchV4,
  ImageModelV4,
  LanguageModelV4,
  ProviderV4,
} from '@ai-sdk/provider';
import { customProvider, experimental_listBatches as listBatches } from 'ai';
import { print } from '../lib/print';
import { run } from '../lib/run';

const batchApi: BatchV4<{ text: 'fallback-model' }> = {
  specificationVersion: 'v4',
  provider: 'example-provider',
  supportedUrls: {},
  async doStartBatch() {
    throw new Error('Not used in this example.');
  },
  async doGetBatchStatus() {
    throw new Error('Not used in this example.');
  },
  async doGetBatchResults() {
    throw new Error('Not used in this example.');
  },
  async doListBatches() {
    return {
      batches: [
        {
          batchId: 'batch-example',
          status: 'completed',
        },
      ],
    };
  },
};

const fallbackProvider: ProviderV4 & {
  experimental_batch(): typeof batchApi;
} = {
  specificationVersion: 'v4',
  languageModel(): LanguageModelV4 {
    throw new Error('Not used in this example.');
  },
  embeddingModel(): EmbeddingModelV4 {
    throw new Error('Not used in this example.');
  },
  imageModel(): ImageModelV4 {
    throw new Error('Not used in this example.');
  },
  experimental_batch() {
    return batchApi;
  },
};

const provider = customProvider({ fallbackProvider });

run(async () => {
  const result = await listBatches({ provider });
  print('Batches inherited from the fallback provider:', result.batches);
});
