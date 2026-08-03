import { describe, expect, it } from 'vitest';
import { run } from '../dist/index.js';

describe('user source error locations', () => {
  it('reports nested runtime stacks using user source line numbers', async () => {
    const error = await getRunError(`const first = 1;

function explode() {
  throw new Error('boom');
}
explode();`);

    expect(error.stack).toMatch(/^Error: boom\n/u);
    expect(error.stack).toContain('at explode (run.js:4:');
    expect(error.stack).toContain('run.js:6:');
    expect(error.stack).not.toContain('run-setup.js');
    expect(error.stack).not.toContain('__runResult');
  });

  it('reports syntax errors without host parser or wrapper frames', async () => {
    const error = await getRunError(`const valid = 1;
const invalid = ;
return valid;`);

    expect(error.name).toBe('SyntaxError');
    expect(error.stack).toMatch(/^SyntaxError: .+\n/u);
    expect(error.stack).toContain('at run.js:2:');
    expect(error.stack).not.toContain('node:internal');
    expect(error.stack).not.toContain('__runUser__');
    expect(error.stack).not.toContain('run-setup.js');
  });

  it('keeps locations stable after stripping TypeScript syntax', async () => {
    const error = await getRunError(`const value: number = 1;
const label: string = 'test';
throw new TypeError(label + value);`);

    expect(error.stack).toMatch(/^TypeError: test1\n/u);
    expect(error.stack).toContain('run.js:3:');
    expect(error.stack).not.toContain('run-setup.js');
  });

  it('reports the user call site when an awaited binding fails', async () => {
    let error: Error | undefined;
    try {
      await run({
        source: `const input = 'value';

await tools.fail(input);`,
        bindings: {
          tools: {
            fail: () => {
              throw new Error('host secret');
            },
          },
        },
      });
    } catch (caught) {
      error = caught as Error;
    }

    expect(error).toBeDefined();
    expect(error!.message).toBe('Host binding failed.');
    expect(error!.stack).toContain('run.js:3:');
    expect(error!.stack).not.toContain('run-setup.js');
    expect(error!.stack).not.toContain('host secret');
  });
});

async function getRunError(source: string): Promise<Error> {
  try {
    await run({ source });
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected run() to reject.');
}
