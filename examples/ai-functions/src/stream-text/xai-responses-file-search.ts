import { xai } from '@ai-sdk/xai';
import { streamText } from 'ai';
import { run } from '../lib/run';

/**
 * xAI File Search with Vector Stores
 *
 * This example demonstrates how to use xAI's native file_search tool
 * with vector stores (collections).
 *
 * Setup:
 * 1. Create a vector store using the xAI API
 * 2. Upload files to your vector store
 * 3. Replace the vector store ID below with your own
 *
 * @see https://docs.x.ai/docs/guides/using-collections/api
 */

const VectorStoreId = 'collection_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'; // put your collection id

run(async () => {
  const { fullStream } = streamText({
    model: xai.responses('grok-4-1-fast-reasoning'),
    prompt: 'What documents do you have access to? Search through my files.',
    tools: {
      file_search: xai.tools.fileSearch({
        vectorStoreIds: [VectorStoreId],
        maxNumResults: 10,
      }),
    },
    // Optionally force file search:
    // toolChoice: { type: 'tool', toolName: 'file_search' },
  });

  let toolCallCount = 0;

  console.log('\n=== xAI File Search ===\n');

  for await (const event of fullStream) {
    if (event.type === 'tool-call') {
      toolCallCount++;
      console.log(
        `\n[Tool Call ${toolCallCount}] ${event.toolName}${event.providerExecuted ? ' (server-side)' : ' (client)'}`,
      );
    } else if (event.type === 'text-delta') {
      process.stdout.write(event.text);
    } else if (event.type === 'source' && event.sourceType === 'url') {
      console.log(`\n[Citation] ${event.url}`);
    }
  }

  console.log('\n');
});
