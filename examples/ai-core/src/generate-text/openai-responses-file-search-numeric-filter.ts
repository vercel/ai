import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

/**
 * Example: File search with numeric array filters
 *
 * This example demonstrates using the `in` operator with number[] values
 * for filtering documents by numeric metadata (e.g., year, version).
 *
 * Prepare:
 * 1. Create a vector store in OpenAI: https://platform.openai.com/storage/vector_stores/
 * 2. Upload documents with numeric metadata attributes (e.g., year: 2023)
 * 3. Replace the vector store ID below with your own
 */

const VectorStoreId = 'vs_xxxxxxxxxxxxxxxxxxxxxxxx'; // Replace with your vector store ID

async function main() {
  // Example 1: Filter by year using numeric array (in operator)
  const resultByYear = await generateText({
    model: openai.responses('gpt-4.1-mini'),
    prompt: 'Summarize the key findings from the documents.',
    tools: {
      file_search: openai.tools.fileSearch({
        vectorStoreIds: [VectorStoreId],
        maxNumResults: 10,
        // Filter: year must be in [2022, 2023, 2024]
        filters: {
          key: 'year',
          type: 'in',
          value: [2022, 2023, 2024], // number[] - numeric array filter
        },
        ranking: {
          ranker: 'auto',
          scoreThreshold: 0.5,
        },
      }),
    },
    toolChoice: { type: 'tool', toolName: 'file_search' },
    providerOptions: {
      openai: {
        include: ['file_search_call.results'],
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  console.log('\n=== Filter by Year (number[]) ===');
  console.log('Text:', resultByYear.text);
  console.dir(resultByYear.toolCalls, { depth: null });
  console.dir(resultByYear.toolResults, { depth: null });

  // Example 2: Compound filter with numeric and string values
  const resultCompound = await generateText({
    model: openai.responses('gpt-4.1-mini'),
    prompt: 'What are the main topics covered?',
    tools: {
      file_search: openai.tools.fileSearch({
        vectorStoreIds: [VectorStoreId],
        maxNumResults: 10,
        // Compound filter: year in [2023, 2024] AND status = 'published'
        filters: {
          type: 'and',
          filters: [
            {
              key: 'year',
              type: 'in',
              value: [2023, 2024], // number[] for numeric set membership
            },
            {
              key: 'status',
              type: 'eq',
              value: 'published', // string for equality
            },
          ],
        },
        ranking: {
          ranker: 'auto',
        },
      }),
    },
    toolChoice: { type: 'tool', toolName: 'file_search' },
    providerOptions: {
      openai: {
        include: ['file_search_call.results'],
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  console.log('\n=== Compound Filter (year in number[] AND status eq string) ===');
  console.log('Text:', resultCompound.text);
  console.dir(resultCompound.toolCalls, { depth: null });
  console.dir(resultCompound.toolResults, { depth: null });

  // Example 3: Exclude specific years using 'nin' (not in)
  const resultExcludeYears = await generateText({
    model: openai.responses('gpt-4.1-mini'),
    prompt: 'Find recent documents excluding older years.',
    tools: {
      file_search: openai.tools.fileSearch({
        vectorStoreIds: [VectorStoreId],
        maxNumResults: 10,
        // Filter: year must NOT be in [2020, 2021]
        filters: {
          key: 'year',
          type: 'nin',
          value: [2020, 2021], // number[] - exclude these years
        },
      }),
    },
    toolChoice: { type: 'tool', toolName: 'file_search' },
  });

  console.log('\n=== Exclude Years using nin (number[]) ===');
  console.log('Text:', resultExcludeYears.text);
  console.dir(resultExcludeYears.toolCalls, { depth: null });
}

main().catch(console.error);
