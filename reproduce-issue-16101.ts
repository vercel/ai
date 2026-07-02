// Reproduction for vercel/ai issue #16101.
// Uses local built packages directly so it can run from the monorepo root.
import { google } from './packages/google/dist/index.js';
import { embedMany } from './packages/ai/dist/index.js';

async function main() {
  const values = Array.from({ length: 150 }, (_, i) => `document ${i}`);

  try {
    console.log('Running embedMany with', values.length, 'values using gemini-embedding-001...');
    const result = await embedMany({
      model: google.textEmbeddingModel('gemini-embedding-001'),
      values,
    });
    console.log('Unexpected success:', {
      embeddings: result.embeddings.length,
      firstEmbeddingDimensions: result.embeddings[0]?.length,
    });
  } catch (error) {
    console.error('Caught error:');
    console.error(error);
    process.exitCode = 1;
  }
}

void main();
