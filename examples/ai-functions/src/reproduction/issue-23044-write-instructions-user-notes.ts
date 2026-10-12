import assert from 'node:assert/strict';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { writeInstructions } from '@ai-sdk/harness/utils';

async function synchronizeInstructions({
  appendUserNotes,
}: {
  appendUserNotes: boolean;
}): Promise<string> {
  const targetPath = '/synthetic/AGENTS.md';
  const files = new Map<string, string>([[targetPath, 'Original notes.\n']]);

  const sandbox = {
    async readTextFile({ path }: { path: string }) {
      return files.get(path) ?? null;
    },
    async writeTextFile({ path, content }: { path: string; content: string }) {
      files.set(path, content);
    },
    async run({ command }: { command: string }) {
      const match = /^mv -f '([^']+)' '([^']+)'$/.exec(command);
      assert.ok(match, 'Only the metadata rename should run');
      files.set(match[2], files.get(match[1])!);
      files.delete(match[1]);
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  } as unknown as Experimental_SandboxSession;

  const options = {
    sandbox,
    homePath: '/synthetic',
    instructionsFile: 'AGENTS.md',
  };

  await writeInstructions({
    ...options,
    instructions: 'Session instruction one.',
  });

  if (appendUserNotes) {
    files.set(
      targetPath,
      `${files.get(targetPath)}\nUser-added project notes.\n`,
    );
  }

  await writeInstructions({
    ...options,
    instructions: 'Session instruction two.',
  });

  return files.get(targetPath)!;
}

async function main(): Promise<void> {
  const control = await synchronizeInstructions({ appendUserNotes: false });
  const edited = await synchronizeInstructions({ appendUserNotes: true });

  assert.match(control, /Original notes\./);
  assert.match(control, /Session instruction two\./);
  assert.doesNotMatch(control, /Session instruction one\./);
  assert.match(edited, /Original notes\./);
  assert.match(edited, /Session instruction two\./);
  assert.doesNotMatch(edited, /Session instruction one\./);
  assert.match(
    edited,
    /User-added project notes\./,
    'ISSUE #23044: writeInstructions discarded user notes appended after the managed instruction block',
  );
}

main();
