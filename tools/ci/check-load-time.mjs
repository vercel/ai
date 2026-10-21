import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const limits = {
  ai: 110,
  '@ai-sdk/openai': 90,
  '@ai-sdk/openai-compatible': 70,
  '@ai-sdk/anthropic': 75,
  '@ai-sdk/google': 70,
};
let failed = false;
// Measure serially: concurrent benchmarks distort each other's import times.
for (const [name, limit] of Object.entries(limits)) {
  const directory = name === 'ai' ? 'ai' : name.slice('@ai-sdk/'.length);
  const cwd = fileURLToPath(new URL(`../../packages/${directory}`, import.meta.url));
  const times = [];
  for (let iteration = 0; iteration < 50; iteration++) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
      const start = performance.now();
      await import(${JSON.stringify(name)});
      console.log(performance.now() - start);
    `], { cwd, encoding: 'utf8' });
    if (result.error) throw result.error;
    const time = Number(result.stdout.trim());
    if (result.status !== 0 || !result.stdout.trim() || !Number.isFinite(time)) {
      throw new Error(`Cannot measure ${name}: ${result.stderr || result.stdout}`);
    }
    times.push(time);
  }
  times.sort((a, b) => a - b);
  const median = (times[24] + times[25]) / 2;
  const message = `${name}: ${median.toFixed(1)} ms (limit ${limit} ms)`;
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${message}\n`);
  if (median > limit) {
    console.error(`::warning::${message}`);
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
