import { execFile } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import * as workerSourceModule from '../dist/runtime/worker-source.js';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const { INLINE_CODE_MODE_WORKER_SOURCE } = workerSourceModule as {
  INLINE_CODE_MODE_WORKER_SOURCE: string;
};

describe('bundled runtime', () => {
  it('does not publish runtime asset subpaths', async () => {
    await expect(runIsolated(resolveAssetSubpathsScript)).resolves.toBe('');
  });

  it('runs from a production-shaped package install without QuickJS dependencies', async () => {
    const tempRoot = await createProductionPackageFixture();
    try {
      await expect(
        runIsolated(bundledRuntimePackageScript, tempRoot),
      ).resolves.toBe('');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('bundles inline worker package dependencies into generated source', () => {
    expect(INLINE_CODE_MODE_WORKER_SOURCE).toContain(
      '__CODE_MODE_QUICKJS_WASM_BASE64__',
    );
    expect(INLINE_CODE_MODE_WORKER_SOURCE).not.toMatch(/\brequire\(/u);
    expect(INLINE_CODE_MODE_WORKER_SOURCE).not.toMatch(/\bimport\(/u);
    expect(INLINE_CODE_MODE_WORKER_SOURCE).not.toContain('createRequire');
    expect(INLINE_CODE_MODE_WORKER_SOURCE).not.toContain(
      '"quickjs-emscripten"',
    );
    expect(INLINE_CODE_MODE_WORKER_SOURCE).not.toContain('@jitl/');
    expect(INLINE_CODE_MODE_WORKER_SOURCE).not.toContain('node_modules/.pnpm');
  });

  it('can run the inline worker without reading a WASM file', async () => {
    await expect(
      runIsolated(inlineWorkerBlocksWasmFileReadScript),
    ).resolves.toBe('');
  });
});

async function runIsolated(
  script: string,
  cwd = process.cwd(),
): Promise<string> {
  const scriptPath = join(
    cwd,
    `.tmp-code-mode-bundled-runtime-${Date.now()}.mjs`,
  );
  await writeFile(scriptPath, script);
  try {
    const { stderr } = await execFileAsync(process.execPath, [scriptPath], {
      cwd,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      timeout: 15_000,
    });
    return stderr;
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
}

async function createProductionPackageFixture(): Promise<string> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'code-mode-bundled-runtime-'));
  const packageRoot = join(tempRoot, 'node_modules/@ai-sdk/code-mode');
  await mkdir(packageRoot, { recursive: true });
  await cp(join(process.cwd(), 'dist'), join(packageRoot, 'dist'), {
    recursive: true,
  });
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify(await readProductionPackageJson(), null, 2),
  );
  await rm(join(packageRoot, 'dist/runtime/worker.js'), { force: true });
  await rm(join(packageRoot, 'dist/runtime-assets'), {
    recursive: true,
    force: true,
  });
  await symlinkDependency(tempRoot, 'ai');
  await symlinkDependency(tempRoot, 'zod');
  return tempRoot;
}

async function readProductionPackageJson(): Promise<Record<string, unknown>> {
  const packageJson = JSON.parse(
    await readFile(join(process.cwd(), 'package.json'), 'utf8'),
  ) as Record<string, unknown> & {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  if (packageJson.dependencies?.['quickjs-emscripten'] !== undefined) {
    throw new Error('quickjs-emscripten must not be a production dependency.');
  }
  delete packageJson.devDependencies;
  delete packageJson.scripts;
  return packageJson;
}

async function symlinkDependency(
  tempRoot: string,
  dependencyName: 'ai' | 'zod',
): Promise<void> {
  const dependencyRoot = dirname(
    require.resolve(`${dependencyName}/package.json`),
  );
  await symlink(
    dependencyRoot,
    join(tempRoot, 'node_modules', dependencyName),
    'dir',
  );
}

const resolveAssetSubpathsScript = `
for (const specifier of [
  "@ai-sdk/code-mode/worker",
  "@ai-sdk/code-mode/quickjs-wasm",
  "@ai-sdk/code-mode/runtime-assets",
]) {
  try {
    import.meta.resolve(specifier);
    throw new Error(\`Expected \${specifier} resolution to fail.\`);
  } catch (error) {
    if (error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") {
      throw error;
    }
  }
}
`;

const bundledRuntimePackageScript = `
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runCodeMode } from "@ai-sdk/code-mode";

const packageRoot = join(
  process.cwd(),
  "node_modules/@ai-sdk/code-mode",
);
const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));

if (packageJson.dependencies && "quickjs-emscripten" in packageJson.dependencies) {
  throw new Error("quickjs-emscripten should not be a production dependency.");
}
for (const forbiddenPath of [
  join(packageRoot, "dist/runtime/worker.js"),
  join(packageRoot, "dist/runtime-assets/emscripten-module.wasm"),
]) {
  if (await access(forbiddenPath).then(() => true, () => false)) {
    throw new Error("Unexpected runtime asset in package fixture: " + forbiddenPath);
  }
}

const result = await runCodeMode({
  js: "return { ok: true, bundledRuntime: typeof require === 'undefined' };",
  tools: {},
});
if (JSON.stringify(result) !== JSON.stringify({ ok: true, bundledRuntime: true })) {
  throw new Error(\`Unexpected code-mode result: \${JSON.stringify(result)}\`);
}
`;

const inlineWorkerBlocksWasmFileReadScript = `
import { Buffer } from "node:buffer";
import { Worker } from "node:worker_threads";
import { INLINE_CODE_MODE_WORKER_SOURCE } from "./dist/runtime/worker-source.js";

if (INLINE_CODE_MODE_WORKER_SOURCE.includes("readFileSync")) {
  throw new Error("Inline worker source should not contain a WASM file read path.");
}

const workerUrl = new URL(
  "data:text/javascript;base64," + Buffer.from(INLINE_CODE_MODE_WORKER_SOURCE).toString("base64"),
);
const worker = new Worker(workerUrl);
try {
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for inline worker.")), 10_000);
    let resultMessage;

    worker.once("error", reject);
    worker.on("message", (message) => {
      if (message.type === "result") {
        resultMessage = message;
      }
      if (message.type === "ready") {
        clearTimeout(timer);
        resolve(resultMessage);
      }
    });

    worker.postMessage({
      type: "run",
      invocationId: "inline-wasm-test",
      js: "return { ok: true };",
      determinism: {
        dateNowMs: 0,
        randomSeed: "0123456789abcdef0123456789abcdef",
      },
      options: {
        timeoutMs: 5_000,
        memoryLimitBytes: 128 * 1024 * 1024,
        maxStackSizeBytes: 1024 * 1024,
        maxResultBytes: 1024 * 1024,
        fetchEnabled: false,
      },
    });
  });

  if (!result || result.success !== true || result.valueJson !== '{"ok":true}') {
    throw new Error("Unexpected worker result: " + JSON.stringify(result));
  }
} finally {
  await worker.terminate();
}
`;
