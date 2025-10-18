import {
  anthropic,
  anthropicSourceExecutionFileProviderMetadataSchema,
} from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { run } from '../lib/run';
import * as fs from 'fs';

run(async () => {
  const result = streamText({
    model: anthropic('claude-sonnet-4-5'),
    prompt: 'エクセルファイルに歴史の人物１０人書いて。',
    tools: {
      code_execution: anthropic.tools.codeExecution_20250825(),
    },
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta': {
        process.stdout.write(part.text);
        break;
      }

      case 'tool-call': {
        process.stdout.write(
          `\n\nTool call: '${part.toolName}'\nInput: ${JSON.stringify(part.input, null, 2)}\n`,
        );
        break;
      }

      case 'tool-result': {
        process.stdout.write(
          `\nTool result: '${part.toolName}'\nOutput: ${JSON.stringify(part.output, null, 2)}\n`,
        );
        break;
      }

      case 'error': {
        console.error('\n\nCode execution error:', part.error);
        break;
      }
    }
  }

  process.stdout.write('\n\n');

  const resultContent = await result.content;

  const sourceList = resultContent.filter(
    c => c.type === 'source' && c.sourceType === 'execution-file',
  );

  const fileIdList = sourceList.flatMap(source => {
    const executeFileParsed =
      anthropicSourceExecutionFileProviderMetadataSchema.safeParse(
        source.providerMetadata,
      );
    if (!executeFileParsed.success) return [];
    switch (executeFileParsed.data.anthropic.content.type) {
      case 'bash_code_execution_result': {
        const fileIdMap = executeFileParsed.data.anthropic.content.content.map(
          c => c.file_id,
        );
        return fileIdMap;
      }
      case 'bash_code_execution_tool_result_error': {
        return [];
      }
      default: {
        return [];
      }
    }
  });

  await Promise.all(
    fileIdList.map(async fileId => {
      await downloadFile(fileId);
    }),
  );
});

async function downloadFile(file: string) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    const infoUrl = `https://api.anthropic.com/v1/files/${file}`;
    const infoResponse = await fetch(infoUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'files-api-2025-04-14',
      },
    });
    if (!infoResponse.ok) {
      throw new Error(
        `HTTP Error: ${infoResponse.status} ${infoResponse.statusText}`,
      );
    }

    // https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/resources/beta/files.ts
    const {
      filename,
    }: {
      type: 'file';
      id: string;
      size_bytes: number;
      created_at: Date;
      filename: string;
      mime_type: string;
      downloadable?: boolean;
    } = await infoResponse.json();

    const downloadUrl = `https://api.anthropic.com/v1/files/${file}/content`;
    const downloadResponse = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'files-api-2025-04-14',
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
