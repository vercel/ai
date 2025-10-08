import 'dotenv/config';
import { azure,azureSourceExecutionFileProviderMetadataSchema } from '@ai-sdk/azure';
import { generateText } from 'ai';
import * as fs from 'fs';

async function main() {
  // Basic text generation
  const result = await generateText({
    model: azure.responses('gpt-4.1-mini'),
    prompt:
      'Create an Excel file with the names of 10 historical figures. Run it immediately. No questions allowed.',
    tools: {
      code_interpreter: azure.tools.codeInterpreter(),
    },
  });

  console.log('\n=== Basic Text Generation ===');
  console.dir(result.text, { depth: Infinity });
  console.log('\n=== Other Outputs ===');
  console.dir(result.toolCalls, { depth: Infinity });
  console.dir(result.toolResults, { depth: Infinity });
  console.dir(result.content, { depth: Infinity });

  const fileList = result.content.filter(
    c => c.type === 'source' && c.sourceType === 'executionFile',
  );

  await fileList.map(async file => {
    const executeFileParse =
      azureSourceExecutionFileProviderMetadataSchema.safeParse(
        file.providerMetadata,
      );
    if (executeFileParse.success) {
      await downloadContainerFile(
        executeFileParse.data.azure.containerId,
        executeFileParse.data.azure.fileId,
      );
    }
  });
}

async function downloadContainerFile(container: string, file: string) {
  try {
    const resourceName = process.env.AZURE_RESOURCE_NAME;
    const apiKey = process.env.AZURE_API_KEY;

    if (!resourceName) {
      throw new Error('AZURE_RESOURCE_NAME is not set');
    }
    if (!apiKey) {
      throw new Error('AZURE_API_KEY is not set');
    }
    const infoUrl = `https://${resourceName}.openai.azure.com/openai/v1/containers/${container}/files/${file}`;
    const infoResponse = await fetch(infoUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!infoResponse.ok) {
      throw new Error(
        `HTTP Error: ${infoResponse.status} ${infoResponse.statusText}`,
      );
    }
    const {
      path,
    }: {
      id: string;
      object: string;
      created_at: number;
      bytes: number;
      container_id: string;
      path: string;
      source: string;
    } = await infoResponse.json();

    const filename = path.split('/').at(-1) || 'result-file';

    const downloadUrl = `https://${resourceName}.openai.azure.com/openai/v1/containers/${container}/files/${file}/content`;
    const downloadResponse = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!downloadResponse.ok) {
      throw new Error(
        `HTTP Error: ${downloadResponse.status} ${downloadResponse.statusText}`,
      );
    }

    // get as binary data
    const arrayBuffer = await downloadResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const outputPath = `output/${filename}`;

    fs.writeFileSync(outputPath, buffer);

    console.log(`file saved: ${outputPath}`);
    console.log(`file size: ${buffer.length} bytes`);

    return {
      path: outputPath,
      size: buffer.length,
    };
  } catch (error) {
    console.error('error:', error);
    throw error;
  }
}

main().catch(console.error);
