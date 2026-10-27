import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { experimental_createFsTools as createFsTools } from '@ai-sdk/tool-fs';
import { isStepCount, ToolLoopAgent } from 'ai';
import { run } from '../../lib/run';

const fsTools = createFsTools();

const agent = new ToolLoopAgent({
  model: 'openai/gpt-6-astra',
  tools: fsTools,
  stopWhen: isStepCount(20),
});

run(async () => {
  const session = await createJustBashNetworkSandboxSession();

  try {
    const sandbox = session.restricted();
    await sandbox.writeTextFile({
      path: 'src/math.ts',
      content: [
        'export function add(a: number, b: number) {',
        '  return a - b;',
        '}',
        '',
        'export function multiply(a: number, b: number) {',
        '  return a * b;',
        '}',
        '',
      ].join('\n'),
    });
    await sandbox.writeTextFile({
      path: 'src/math.test.ts',
      content: [
        "import { add, multiply } from './math';",
        '',
        'expect(add(1, 2)).toBe(3);',
        'expect(multiply(2, 3)).toBe(6);',
        '',
      ].join('\n'),
    });
    await sandbox.writeTextFile({ path: 'src/old-math.ts', content: '' });

    const result = await agent.generate({
      prompt:
        'Find the bug in the math functions and fix it. ' +
        'Delete src/old-math.ts, which is unused.',
      experimental_sandbox: sandbox,
    });

    console.log(result.text);
    console.log();
    console.log(await sandbox.readTextFile({ path: 'src/math.ts' }));
    console.log(await sandbox.listDirectory({ path: 'src' }));
  } finally {
    await session.destroy();
  }
});
