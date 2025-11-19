import { azure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import 'dotenv/config';

/**
 * prepare
 * Please add parameters in your .env file for initialize Azure OpenAI..
 * AZURE_RESOURCE_NAME="<your_resource_name>"
 * AZURE_API_KEY="<your_api_key>"
 */

async function main() {
  // Basic text generation
  const basicResult = await generateText({
    model: azure.responses('gpt-4.1-mini'),
    prompt:
      'Summarize three major news stories from today.',
    tools: {
      web_search_preview: azure.tools.webSearchPreview({searchContextSize:"medium"}),
    },
  });

  console.log('\n=== Basic Text Generation ===');
  console.log(basicResult.text);
  console.log('\n=== Other Outputs ===');
  console.dir(basicResult.toolCalls, { depth: Infinity });
  console.dir(basicResult.toolResults, { depth: Infinity });
  console.log('\n=== Web Search Preview Annotations ===');
  for (const part of basicResult.content) {
    if (part.type === 'text') {
      const annotations = part.providerMetadata?.openai?.annotations;
      if (annotations) {
        console.dir(annotations);
      }
    }
  }
}

main().catch(console.error);
