import { mkdtemp, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localWorkspace } from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createClaudeCode } from './_create';
import { run } from '../../lib/run';

const claudeCode = createClaudeCode();

// Runs the harness on THIS machine, as the current user, with no isolation:
// the same trust level as running `claude` in your terminal. It drives your
// own `claude` installation and credentials; Harness SDK state lives in
// ~/.ai-sdk/harness/projects/…, never inside the project.
run(async () => {
  const projectPath = await mkdtemp(
    join(await realpath(tmpdir()), 'local-workspace-example-'),
  );
  console.log('project:', projectPath);

  const agent = new HarnessAgent({
    harness: claudeCode,
    workspace: localWorkspace({ path: projectPath }),
  });

  const session = await agent.createSession();
  try {
    const result = await agent.generate({
      session,
      prompt:
        'Create a file named NOTES.md in the working directory containing ' +
        'a one-sentence description of this directory. Then stop.',
    });
    console.log('text:', result.text);

    // The file landed in the local project directory itself.
    console.log(
      'NOTES.md:',
      await readFile(join(projectPath, 'NOTES.md'), 'utf8'),
    );
  } finally {
    await session.destroy();
  }
});
