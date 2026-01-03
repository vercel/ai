import { openai } from '@ai-sdk/openai';
import { vectorstores, vercelEmbedding } from '@ai-sdk/vectorstores';
import { VectorStoreIndex } from '@vectorstores/core';
import { PDFReader } from '@vectorstores/readers/pdf';
import { stepCountIs, streamText } from 'ai';
import { fileURLToPath } from 'node:url';

async function main() {
  // Load the PDF document using vectorstores/readers
  const pdfPath = fileURLToPath(new URL('../../data/ai.pdf', import.meta.url));
  const reader = new PDFReader();
  const documents = await reader.loadData(pdfPath);

  console.log(`Loaded ${documents.length} document(s) from PDF`);

  // Create the vector index with AI SDK embeddings
  const index = await VectorStoreIndex.fromDocuments(documents, {
    embedFunc: vercelEmbedding(openai.embedding('text-embedding-3-small')),
  });
  console.log('Created vector index');

  const result = await streamText({
    model: openai.chat('gpt-4o-mini'),
    prompt:
      'What is the difference between a generative model and an embedding model?',
    tools: {
      queryKnowledge: vectorstores({
        index,
        description:
          'Search the AI knowledge base for information about AI concepts.',
        similarityTopK: 3,
      }),
    },
    stopWhen: stepCountIs(5),
  });

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'text-delta') {
      process.stdout.write(chunk.text);
    } else if (chunk.type === 'tool-call') {
      console.log(`TOOL CALL ${chunk.toolName} ${JSON.stringify(chunk.input)}`);
    }
  }
}

main().catch(console.error);
