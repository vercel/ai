import 'dotenv/config';
import { azure } from '@ai-sdk/azure';
import type {
  AzureResponsesTextProviderMetadata,
  AzureResponsesSourceDocumentProviderMetadata,
} from '@ai-sdk/azure';
import { streamText } from 'ai';
import { z } from 'zod/v4';
import { downloadAzureContainerFile } from '../lib/download-azure-container-file';

/**
 * prepare
 * Please add parameters in your .env file for initialize Azure OpenAI..
 * AZURE_RESOURCE_NAME="<your_resource_name>"
 * AZURE_API_KEY="<your_api_key>"
 */

const azureResponsesTextProviderMetadataSchema =
  z.custom<AzureResponsesTextProviderMetadata>();
const azureResponsesSourceDocumentProviderMetadataSchema =
  z.custom<AzureResponsesSourceDocumentProviderMetadata>();

async function main() {
  // Basic text generation
  const result = streamText({
    model: azure.responses('gpt-4.1-mini'), // use your own deployment
    prompt:
      'Create a program that generates five random numbers between 1 and 100 with two decimal places, and show me the execution results. Also save the result to a file.',
    tools: {
      code_interpreter: azure.tools.codeInterpreter(),
    },
  });

  console.log('\n=== Basic Text Generation ===');
  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
  console.log('\n=== Other Outputs ===');
  console.log(await result.toolCalls);
  console.log(await result.toolResults);
  console.log('\n=== Code Interpreter Annotations ===');

  const containerfileList:{
    containerId:string;
    fileId:string;
  }[]=[];
  for await (const part of result.fullStream) {
    if (part.type === 'text-end') {
      const { azure } = azureResponsesTextProviderMetadataSchema.parse(
        part.providerMetadata,
      );
      console.log('-- text-part-- ');
      console.dir({ azure }, { depth: Infinity });
    } else if (part.type === 'source') {
      if (part.sourceType === 'document') {
        const { azure } =
          azureResponsesSourceDocumentProviderMetadataSchema.parse(
            part.providerMetadata,
          );
        console.log('-- source-document-part-- ');
        console.dir({ azure }, { depth: Infinity });
        if(azure.type==="container_file_citation"){
          containerfileList.push({containerId:azure.containerId,fileId:azure.fileId});
        }
      }
    }
  }
  for await (const containerFile of containerfileList){
    await downloadAzureContainerFile(containerFile.containerId,containerFile.fileId)
  }
}

main().catch(console.error);
