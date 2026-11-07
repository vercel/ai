import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../../lib/run';
import * as fs from 'fs';
import path from 'node:path';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    prompt:
      'Write a Python script to calculate fibonacci number' +
      ' and then execute it to find the 10th fibonacci number' +
      ' finally output data to excel file and python code.',
    tools: {
      code_execution: anthropic.tools.codeExecution_20250825(),
    },
  });

  console.dir(result.content, { depth: Infinity });

  const fileIdList = result.staticToolResults.flatMap(t => {
    if (
      t.toolName === 'code_execution' &&
      t.output.type === 'bash_code_execution_result'
    ) {
      return t.output.content.map(o => o.file_id);
    }
    return [];
  });

  await Promise.all(fileIdList.map(fileId => downloadFile(fileId)));
});

async function downloadFile(fileId: string) {
  const files = anthropic.files();
  const file = { anthropic: fileId };
  const metadata = await files.getFileMetadata!({ file });
  const download = await files.downloadFile!({ file });
  const buffer = Buffer.from(
    await new Response(download.content).arrayBuffer(),
  );
  await fs.promises.mkdir('output', { recursive: true });
  const outputPath = path.join(
    'output',
    path.basename(metadata.filename ?? fileId),
  );
  await fs.promises.writeFile(outputPath, buffer);
  console.log('File saved:', outputPath);
  console.log('File size:', buffer.length, 'bytes');
  console.log('Media type:', download.mediaType);
  return { path: outputPath, size: buffer.length };
}
