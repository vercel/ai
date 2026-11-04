import { azure } from '@ai-sdk/azure';
import { generateText, isStepCount } from 'ai';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { createApplyPatchExecutor } from '../../lib/apply-patch-file-editor';
import { run } from '../../lib/run';

run(async () => {
  const workspaceRoot = await fs.mkdtemp(
    path.join(tmpdir(), 'ai-sdk-azure-apply-patch-'),
  );

  const result = await generateText({
    model: azure.responses('gpt-5.1'),
    stopWhen: isStepCount(5),
    tools: {
      apply_patch: azure.tools.applyPatch({
        execute: createApplyPatchExecutor(workspaceRoot),
      }),
    },
    prompt: `Create a markdown file with a shopping checklist of 5 entries.`,
  });

  console.log('\n=== Result ===');
  console.log('Text:', result.text);
  console.log('\nFiles saved in:', workspaceRoot);

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
