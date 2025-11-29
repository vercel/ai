import { azure } from '@ai-sdk/azure';
import type {
  AzureResponsesTextProviderMetadata,
  AzureResponsesSourceDocumentProviderMetadata,
} from '@ai-sdk/azure';
import { generateText } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

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
  const basicResult = await generateText({
    model: azure.responses('gpt-4.1-mini'),
    prompt:
      'Create a program that generates five random numbers between 1 and 100 with two decimal places, and show me the execution results. Also save the result to a file.',
    tools: {
      code_interpreter: azure.tools.codeInterpreter(),
    },
  });

  console.log('\n=== Basic Text Generation ===');
  console.log(basicResult.text);
  console.log('\n=== Other Outputs ===');
  console.dir(basicResult.toolCalls, { depth: Infinity });
  console.dir(basicResult.toolResults, { depth: Infinity });
  console.log('\n=== Code Interpreter Annotations ===');
  for (const part of basicResult.content) {
    if (part.type === 'text') {
      const providerMetadataParsed =
        azureResponsesTextProviderMetadataSchema.safeParse(
          part.providerMetadata,
        );
      if (providerMetadataParsed.success) {
        const { azure } = providerMetadataParsed.data;
        console.log('-- text-part-- ');
        console.dir({ azure }, { depth: Infinity });
      }
    } else if (part.type === 'source') {
      if (part.sourceType === 'document') {
        const providerMetadataParsed =
          azureResponsesSourceDocumentProviderMetadataSchema.safeParse(
            part.providerMetadata,
          );
        if (providerMetadataParsed.success) {
          const { azure } = providerMetadataParsed.data;
          console.log('-- source-document-part-- ');
          console.dir({ azure }, { depth: Infinity });
        }
      }
    }
  }
}

main().catch(console.error);
