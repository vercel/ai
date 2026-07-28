import { execFile } from 'node:child_process';
import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('sandbox console', () => {
  it('forwards console log/info/debug to stdout and error to stderr', async () => {
    const { stdout, stderr } = await runIsolated(`
import {
  experimental_runCodeMode as runCodeMode,
  experimental_setMaxWorkers as setMaxWorkers,
} from "./dist/index.js";

setMaxWorkers(1);
await runCodeMode({
  js: \`
    console.log("log", { a: 1 });
    console.info("info %s", "value");
    console.debug("debug", 3);
    console.error("err", { bad: true });
    return "ok";
  \`,
  tools: {},
});
`);

    expect(stdout).toBe('log { a: 1 }\ninfo value\ndebug 3\n');
    expect(stderr).toBe('err { bad: true }\n');
  });
});

async function runIsolated(
  script: string,
): Promise<{ stdout: string; stderr: string }> {
  const scriptPath = join(
    process.cwd(),
    `.tmp-code-mode-console-test-${process.pid}-${Date.now()}.mjs`,
  );
  writeFileSync(scriptPath, script);
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [scriptPath],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
        timeout: 15_000,
      },
    );
    return { stdout, stderr };
  } finally {
    try {
      unlinkSync(scriptPath);
    } catch {}
  }
}
