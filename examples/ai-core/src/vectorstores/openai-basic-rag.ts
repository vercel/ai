import { openai } from '@ai-sdk/openai';
import { vectorstores, vercelEmbedding } from '@ai-sdk/vectorstores';
import { Document, VectorStoreIndex } from '@vectorstores/core';
import { generateText, stepCountIs } from 'ai';

async function main() {
  // Sample document content
  const document = new Document({
    text: `The company offers 15 days of paid vacation per year for full-time employees. After 5 years of service, employees receive an additional 5 days. Vacation days must be requested at least 2 weeks in advance for periods longer than 3 days.`,
  });

  console.log('Creating vector index...');

  // Create the vector index with AI SDK embeddings
  const index = await VectorStoreIndex.fromDocuments([document], {
    embedFunc: vercelEmbedding(openai.embedding('text-embedding-3-small')),
  });

  console.log('Created vector index with 1 document');

  // Use the vectorstores tool with generateText
  const result = await generateText({
    model: openai('gpt-5-mini'),
    prompt: 'How many vacation days do employees get?',
    tools: {
      queryKnowledge: vectorstores({
        index,
        description:
          'Search the company knowledge base for policies and guidelines.',
        similarityTopK: 3,
      }),
    },
    stopWhen: stepCountIs(5),
  });

  console.log(result.text);
}

main().catch(console.error);
