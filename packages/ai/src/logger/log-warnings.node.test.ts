import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { describe, expect, it } from 'vitest';

// Run the actual logger in a fresh Node process so flags and warning events are
// exercised without replacing process.emitWarning with a mock.
const loggerSource = buildSync({
  entryPoints: [fileURLToPath(new URL('./log-warnings.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
}).outputFiles[0].text;

function runLogger(flags: string[] = []) {
  return spawnSync(
    process.execPath,
    [
      ...flags,
      '-e',
      `${loggerSource}
    process.on('warning', warning => console.log(JSON.stringify({
      name: warning.name, code: warning.code,
    })));
    const options = { warnings: [{
      type: 'deprecated', setting: 'generateObject',
      message: 'Use generateText with an output setting instead.',
    }] };
    module.exports.logWarnings(options);
    module.exports.logWarnings(options);
  `,
    ],
    { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } },
  );
}

describe('Node deprecation warning behavior', () => {
  it('emits a coded warning event and prints the deprecation only once', () => {
    const result = runLogger();
    expect(result.status).toBe(0);
    expect(
      result.stdout
        .trim()
        .split('\n')
        .map(line => JSON.parse(line)),
    ).toEqual([
      { name: 'Warning' },
      { name: 'DeprecationWarning', code: 'AISDK_DEP_GENERATE_OBJECT' },
    ]);
    expect(result.stderr.match(/\[AISDK_DEP_GENERATE_OBJECT\]/g)).toHaveLength(
      1,
    );
  });

  it('suppresses deprecations with --no-deprecation', () => {
    const result = runLogger(['--no-deprecation']);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('DeprecationWarning');
    expect(result.stderr).not.toContain('AISDK_DEP_GENERATE_OBJECT');
  });

  it('throws deprecations with --throw-deprecation', () => {
    const result = runLogger(['--throw-deprecation']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DeprecationWarning');
    expect(result.stderr).toContain("code: 'AISDK_DEP_GENERATE_OBJECT'");
  });

  it('includes the call stack with --trace-deprecation', () => {
    const result = runLogger(['--trace-deprecation']);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('[AISDK_DEP_GENERATE_OBJECT]');
    expect(result.stderr).toMatch(/at (?:Object\.)?logWarnings/);
  });
});
