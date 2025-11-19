import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import 'dotenv/config';

/**
 * prepare
 * Please add parameters in your .env file for initialize Azure OpenAI..
 * AZURE_RESOURCE_NAME="<your_resource_name>"
 * AZURE_API_KEY="<your_api_key>"
 */

async function main() {
  // Basic text generation
  const result = streamText({
    model: azure.responses('gpt-4.1-mini'), // use your own deployment
    prompt:
      'Summarize three major news stories from today.',
    tools: {
      web_search_preview: azure.tools.webSearchPreview({searchContextSize:"low"}),
    },
  });

  console.log('\n=== Basic Text Generation ===');
  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
  console.log('\n=== Other Outputs ===');
  console.log(await result.toolCalls);
  console.log(await result.toolResults);
  console.log('\n=== Web Search Preview Annotations ===');
   for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-end':{
        const annotations = part.providerMetadata?.openai?.annotations;
        if (annotations) {
          console.dir(annotations);
        }
        }
        break;


      case 'source':
        if (part.sourceType === 'url') {
          console.log(`\n[source: ${part.url}]`);
        }
        break;
    }
  }
}

main().catch(console.error);
