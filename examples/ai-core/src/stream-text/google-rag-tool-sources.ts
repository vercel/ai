import { google } from '@ai-sdk/google';
import { streamText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

// Simulated knowledge base - in a real application, this would be a vector database
const knowledgeBase = [
  {
    id: 'doc-1',
    title: 'Introduction to AI',
    url: 'https://example.com/intro-to-ai',
    content:
      'Artificial Intelligence (AI) is the simulation of human intelligence processes by machines, especially computer systems.',
  },
  {
    id: 'doc-2',
    title: 'Machine Learning Basics',
    url: 'https://example.com/ml-basics',
    content:
      'Machine Learning is a subset of AI that enables systems to learn and improve from experience without being explicitly programmed.',
  },
  {
    id: 'doc-3',
    title: 'Neural Networks Explained',
    url: 'https://example.com/neural-networks',
    content:
      'Neural networks are computing systems inspired by biological neural networks that constitute animal brains.',
  },
];

async function main() {
  const result = streamText({
    model: google('gemini-2.5-pro'),
    messages: [
      {
        role: 'user',
        content: 'What is machine learning? Please cite your sources.',
      },
    ],
    tools: {
      // RAG tool that searches knowledge base and writes sources
      searchKnowledge: tool({
        description:
          'Search the knowledge base for relevant information. Always use this tool when answering questions to provide accurate, sourced information.',
        inputSchema: z.object({
          query: z.string().describe('The search query'),
          limit: z
            .number()
            .optional()
            .default(3)
            .describe('Maximum number of results to return'),
        }),
        execute: async ({ query, limit = 3 }, { writeSource }) => {
          console.log(`\n[Tool] Searching knowledge base for: "${query}"`);

          // Simulate search (in a real app, this would use vector similarity search)
          const results = knowledgeBase
            .filter(doc =>
              doc.content.toLowerCase().includes(query.toLowerCase()),
            )
            .slice(0, limit);

          console.log(`[Tool] Found ${results.length} results`);

          // Write sources to the stream as we find them
          results.forEach(doc => {
            console.log(`[Tool] Writing source: ${doc.title}`);

            // This is the new feature! Tools can now write sources directly
            writeSource?.({
              sourceType: 'url',
              url: doc.url,
              title: doc.title,
              id: doc.id, // Optional: provide custom ID
            });
          });

          // Return the content to the LLM
          return results.length > 0
            ? results.map(doc => `${doc.title}: ${doc.content}`).join('\n\n')
            : 'No relevant information found.';
        },
      }),
    },
    maxSteps: 5, // Allow the model to use tools
  });

  console.log('\n=== Streaming Response ===\n');

  // Process the stream and display both text and sources
  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta': {
        process.stdout.write(part.textDelta);
        break;
      }

      case 'tool-call': {
        console.log(`\n\n[Tool Call] ${part.toolName}`);
        console.log(`[Arguments] ${JSON.stringify(part.args)}`);
        break;
      }

      case 'source': {
        // Sources written by tools appear here!
        console.log('\n--- Source Referenced ---');
        if (part.sourceType === 'url') {
          console.log(`Title: ${part.title}`);
          console.log(`URL: ${part.url}`);
          console.log(`ID: ${part.id}`);
        }
        console.log('------------------------\n');
        break;
      }

      case 'tool-result': {
        const resultText = typeof part.output === 'string' ? part.output : JSON.stringify(part.output);
        console.log(`\n[Tool Result] Returned ${resultText.length} characters`);
        break;
      }

      case 'finish': {
        console.log(`\n\n[Finished] Reason: ${part.finishReason}`);
        break;
      }

      case 'error': {
        console.error('\n[Error]', part.error);
        break;
      }
    }
  }

  // Access sources from the final result
  console.log('\n\n=== All Sources ===');
  const sources = result.experimental_providerMetadata?.sources || [];
  if (sources.length > 0) {
    sources.forEach((source: any, index: number) => {
      console.log(`${index + 1}. ${source.title} - ${source.url}`);
    });
  } else {
    console.log('No sources available in metadata');
  }
}

main().catch(console.error);
