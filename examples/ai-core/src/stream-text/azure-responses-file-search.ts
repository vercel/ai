import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import 'dotenv/config';

/**
 * prepare 1
 * Please add parameters in your .env file for initialize Azure OpenAI.
 * AZURE_RESOURCE_NAME="<your_resource_name>"
 * AZURE_API_KEY="<your_api_key>"
 *
 * prepare 2
 * Please create vector store and put file in your vector.
 * URL:AOAI vector store portal
 * https://oai.azure.com/resource/vectorstore
 */

const VectorStoreId = 'vs_xxxxxxxxxxxxxxxxxxxxxxxx'; // put your vector store id.

async function main() {
  // Basic text generation
  const result = await streamText({
    model: azure.responses('gpt-4.1-mini'),
    prompt: 'What is quantum computing?', // please question about your documents.
    tools: {
      file_search: azure.tools.fileSearch({
        // optional configuration:
        vectorStoreIds: [VectorStoreId],
        maxNumResults: 10,
        ranking: {
          ranker: 'auto',
        },
      }),
    },
    // Force file search tool:
    toolChoice: { type: 'tool', toolName: 'file_search' },
  });

  console.log('\n=== Basic Text Generation ===');
  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
  console.log('\n=== Other Outputs ===');
  console.dir(await result.toolCalls, { depth: Infinity });
  console.dir(await result.toolResults, { depth: Infinity });
  console.dir(await result.sources, { depth: Infinity });
}

main().catch(console.error);
