import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import type {
  OpenaiResponsesTextProviderMetadata,
  OpenaiResponsesSourceDocumentProviderMetadata,
} from '@ai-sdk/openai';
import { streamText } from 'ai';
import { z } from 'zod/v4';
import { downloadOpenaiContainerFile } from '../lib/download-openai-container-file';

const openaiResponsesTextProviderMetadataSchema =
  z.custom<OpenaiResponsesTextProviderMetadata>();
const openaiResponsesSourceDocumentProviderMetadataSchema =
  z.custom<OpenaiResponsesSourceDocumentProviderMetadata>();

async function main() {
  // Basic text generation
  const result = streamText({
    model: openai.responses('gpt-4.1-mini'),
    prompt:
      'Create a program that generates five random numbers between 1 and 100 with two decimal places, and show me the execution results. Also save the result to a file.',
    tools: {
      code_interpreter: openai.tools.codeInterpreter(),
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
