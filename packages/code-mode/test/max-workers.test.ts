import { execFile } from 'node:child_process';
import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('global max worker configuration', () => {
  it('enforces setMaxWorkers in an isolated process', async () => {
    await expect(runIsolated(setMaxWorkersScript)).resolves.toBe('');
  });

  it('uses available memory to reject an additional default worker', async () => {
    await expect(runIsolated(memorySensitiveDefaultScript)).resolves.toBe('');
  });
});

async function runIsolated(script: string): Promise<string> {
  const scriptPath = join(
    process.cwd(),
    `.tmp-code-mode-worker-test-${process.pid}-${Date.now()}.mjs`,
  );
  writeFileSync(scriptPath, script);
  try {
    const { stderr } = await execFileAsync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      timeout: 15_000,
    });
    return stderr;
  } finally {
    try {
      unlinkSync(scriptPath);
    } catch {}
  }
}

const setMaxWorkersScript = `
import { tool } from "ai";
import { z } from "zod";
import {
  CodeModeConcurrencyError,
  experimental_runCodeMode as runCodeMode,
  experimental_setMaxWorkers as setMaxWorkers,
} from "./dist/index.js";

let releaseSlow;
let startedResolve;
const started = new Promise((resolve) => {
  startedResolve = resolve;
});

const tools = {
  slow: tool({
    inputSchema: z.object({}),
    execute: async () => {
      startedResolve();
      await new Promise((resolve) => {
        releaseSlow = resolve;
      });
      return "ok";
    },
  }),
};

setMaxWorkers(1);
const first = runCodeMode({
  js: "return await tools.slow({});",
  tools,
});
await started;

let rejected = false;
try {
  await runCodeMode({
    js: "return 'blocked';",
    tools,
  });
} catch (error) {
  if (!(error instanceof CodeModeConcurrencyError)) {
    throw error;
  }
  rejected = true;
}
if (!rejected) {
  throw new Error("Expected second invocation to hit maxWorkers.");
}

releaseSlow();
if (await first !== "ok") {
  throw new Error("Expected first invocation to complete.");
}

setMaxWorkers(undefined);
if (await runCodeMode({ js: "return 'slot free';", tools }) !== "slot free") {
  throw new Error("Expected worker slot to be released.");
}
`;

const memorySensitiveDefaultScript = `
import { tool } from "ai";
import { z } from "zod";
import {
  CodeModeConcurrencyError,
  experimental_runCodeMode as runCodeMode,
  experimental_setMaxWorkers as setMaxWorkers,
} from "./dist/index.js";

setMaxWorkers(undefined);
const originalAvailableMemory = Object.getOwnPropertyDescriptor(
  process,
  "availableMemory",
);
try {
  Object.defineProperty(process, "availableMemory", {
    configurable: true,
    value: () => 0,
  });
} catch {
  process.exit(0);
}

let releaseSlow;
let startedResolve;
const started = new Promise((resolve) => {
  startedResolve = resolve;
});

const tools = {
  slow: tool({
    inputSchema: z.object({}),
    execute: async () => {
      startedResolve();
      await new Promise((resolve) => {
        releaseSlow = resolve;
      });
      return "ok";
    },
  }),
};

const first = runCodeMode({
  js: "return await tools.slow({});",
  tools,
});
await started;

let rejected = false;
try {
  await runCodeMode({
    js: "return 'blocked';",
    tools,
  });
} catch (error) {
  if (!(error instanceof CodeModeConcurrencyError)) {
    throw error;
  }
  rejected = true;
}
if (!rejected) {
  throw new Error("Expected memory-sensitive default to reject another worker.");
}

releaseSlow();
await first;

if (originalAvailableMemory === undefined) {
  delete process.availableMemory;
} else {
  Object.defineProperty(process, "availableMemory", originalAvailableMemory);
}
`;
