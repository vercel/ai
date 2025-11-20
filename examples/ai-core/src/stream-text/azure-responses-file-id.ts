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
 * Please put file in your Data files storage.
 * URL:AOAI Data files storage portal
 * https://oai.azure.com/resource/datafile
 */

const fileId = 'assistant-xxxxxxxxxxxxxxxxxxxxxx'; // put your vector store id.

async function main() {
  const result = streamText({
    model: azure.responses('gpt-4.1-mini'), // please question about your documents.
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Plese give me the short summary in the document.',
          },
          {
            type: 'file',
            data: fileId,
            mediaType: 'application/pdf',
            // filename: 'ai.pdf',
          },
        ],
      },
    ],
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main().catch(console.error);
