import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

async function main() {
  const child = spawn('pnpm', ['build'], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';

  child.stdout.on('data', chunk => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });

  child.stderr.on('data', chunk => {
    const text = chunk.toString();
    output += text;
    process.stderr.write(text);
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => resolve(code ?? 1));
  });

  if (exitCode === 0) {
    console.log(
      'Issue #6006 not reproduced: repository build completed successfully.',
    );
    return;
  }

  if (
    output.includes("Cannot read properties of undefined (reading 'split')") ||
    output.includes('sveltekit-openai#build')
  ) {
    throw new Error(
      `Issue #6006 reproduced: repository build failed with exit code ${exitCode}.`,
    );
  }

  throw new Error(
    `Repository build failed for a different reason with exit code ${exitCode}.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
