import { google } from '@ai-sdk/google';
import { embedMany } from 'ai';

async function main() {
  const values = Array.from({ length: 150 }, (_, i) => `document ${i}`);

  try {
    console.log(`Calling embedMany with ${values.length} values using gemini-embedding-001...`);
    const result = await embedMany({
      model: google.textEmbeddingModel('gemini-embedding-001'),
      values,
    });
    console.log('success', {
      embeddings: result.embeddings.length,
      dimensions: result.embeddings[0]?.length,
    });
  } catch (error) {
    console.log(
      'caught',
      error instanceof Error ? `${error.name}: ${error.message}` : error,
    );
    if (error && typeof error === 'object') {
      console.log('statusCode', (error as any).statusCode);
      console.log('responseBody', (error as any).responseBody);
    }
    process.exitCode = 1;
  }
}

void main();
