import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
let building = false;
let rebuildRequested = false;
let debounce;

async function build() {
  if (building) {
    rebuildRequested = true;
    return;
  }
  building = true;
  const child = spawn('pnpm', ['build'], {
    cwd: packageRoot,
    stdio: 'inherit',
  });
  const exitCode = await new Promise(resolve => child.once('exit', resolve));
  building = false;
  if (exitCode !== 0) process.exitCode = 1;
  if (rebuildRequested) {
    rebuildRequested = false;
    await build();
  }
}

await build();
watch(join(packageRoot, 'src'), { recursive: true }, () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => void build(), 75);
});
