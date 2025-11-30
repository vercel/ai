import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import type {
  OpenaiResponsesTextProviderMetadata,
  OpenaiResponsesSourceDocumentProviderMetadata,
} from '@ai-sdk/openai';
import { generateText } from 'ai';
import { z } from 'zod/v4';
import { downloadOpenaiContainerFile } from '../lib/download-openai-container-file';

const openaiResponsesTextProviderMetadataSchema =
  z.custom<OpenaiResponsesTextProviderMetadata>();
const openaiResponsesSourceDocumentProviderMetadataSchema =
  z.custom<OpenaiResponsesSourceDocumentProviderMetadata>();

async function main() {
  // Basic text generation
  const basicResult = await generateText({
    model: openai.responses('gpt-4.1-mini'),
    prompt:
      'Create a program that generates five random numbers between 1 and 100 with two decimal places, and show me the execution results. Also save the result to a file.',
    tools: {
      code_interpreter: openai.tools.codeInterpreter(),
    },
  });

  console.log('\n=== Basic Text Generation ===');
  console.log(basicResult.text);
  console.log('\n=== Other Outputs ===');
  console.log(basicResult.toolCalls);
  console.log(basicResult.toolResults);
  console.log('\n=== Code Interpreter Annotations ===');

  const containerfileList:{
    containerId:string;
    fileId:string;
  }[]=[];
  for (const part of basicResult.content) {
    if (part.type === 'text') {
      const { openai } = openaiResponsesTextProviderMetadataSchema.parse(
        part.providerMetadata,
      );
      console.log('-- text-part-- ');
      console.dir({ openai }, { depth: Infinity });
    } else if (part.type === 'source') {
      if (part.sourceType === 'document') {
        const { openai } =
          openaiResponsesSourceDocumentProviderMetadataSchema.parse(
            part.providerMetadata,
          );
        console.log('-- source-document-part-- ');
        console.dir({ openai }, { depth: Infinity });
        if(openai.type==="container_file_citation"){
          containerfileList.push({containerId:openai.containerId,fileId:openai.fileId});
        }
      }
    }
  }
  for await (const containerFile of containerfileList){
    await downloadOpenaiContainerFile(containerFile.containerId,containerFile.fileId)
  }
}

main().catch(console.error);
