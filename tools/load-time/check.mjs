import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Maximum median import time in milliseconds. Raise a limit only when the
// increase is justified, and explain why in the pull request.
const limits = {
  ai: 190,
  '@ai-sdk/openai': 145,
  '@ai-sdk/openai-compatible': 135,
  '@ai-sdk/anthropic': 145,
  '@ai-sdk/google': 155,
};
const iterations = 50;
const directory = dirname(fileURLToPath(import.meta.url));

let failed = false;
// Measure serially: concurrent imports distort each other's timings.
for (const [name, limit] of Object.entries(limits)) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `const start = performance.now();
await import(${JSON.stringify(name)});
console.log(performance.now() - start);`,
      ],
      { cwd: directory, encoding: 'utf8' },
    );
    const time = Number(result.stdout.trim());
    if (result.status !== 0 || !Number.isFinite(time)) {
      throw new Error(`Cannot measure ${name}: ${result.stderr}`);
    }
    times.push(time);
  }
  times.sort((a, b) => a - b);
  const median = (times[iterations / 2 - 1] + times[iterations / 2]) / 2;
  const ok = median <= limit;
  console.log(
    `${ok ? '✅' : '❌'} ${name}: ${median.toFixed(1)} ms (limit ${limit} ms)`,
  );
  failed ||= !ok;
}

if (failed) {
  console.error(
    '\nLoad time check failed. Investigate slow module initialization, or raise the limit in tools/load-time/check.mjs if the increase is justified.',
  );
  process.exitCode = 1;
}
