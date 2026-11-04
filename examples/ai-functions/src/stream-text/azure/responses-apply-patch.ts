import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { createApplyPatchExecutor } from '../../lib/apply-patch-file-editor';
import { run } from '../../lib/run';

run(async () => {
  const workspaceRoot = await fs.mkdtemp(
    path.join(tmpdir(), 'ai-sdk-azure-apply-patch-'),
  );

  const result = await streamText({
    model: azure.responses('gpt-5.1'),
    prompt: `Create a markdown file with a shopping checklist of 5 entries.`,
    tools: {
      apply_patch: azure.tools.applyPatch({
        execute: createApplyPatchExecutor(workspaceRoot),
      }),
    },
  });

  process.stdout.write('\n=== Model Response (Streaming) ===\n');
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
        console.error('\n\nError:', part.error);
        break;
      }
    }
  }
  process.stdout.write('\n\n');

  console.log('Files saved in:', workspaceRoot);

  // List created files
  const files = await fs.readdir(workspaceRoot, {
    recursive: true,
    withFileTypes: true,
  });
  for (const file of files) {
    if (!file.isFile()) continue;
    const filePath = path.join(file.parentPath, file.name);
    const content = await fs.readFile(filePath, 'utf8');
    console.log(`\n=== ${path.relative(workspaceRoot, filePath)} ===`);
    console.log(content);
  }
});
