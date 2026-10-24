// Download and execute package code only on a runner without publishing tokens.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { context, hostname, installNames, integrity, packageFile, packageUrl, previewVersion, sameRevision } from './shared.mjs';

const c = context(JSON.parse(process.env.TARBALLS_CONTEXT));
const origin = `https://${hostname(c)}`;
let catalog;
for (let attempt = 0; attempt < 6; attempt++) {
  try {
    const response = await fetch(`${origin}/catalog.json`, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
    assert(response.ok, `Catalog HTTP ${response.status}`);
    catalog = await response.json();
    break;
  } catch (error) {
    if (attempt === 5) throw error;
    await new Promise(resolve => setTimeout(resolve, 10_000));
  }
}
assert(sameRevision(context(catalog.context), c));
assert.equal(catalog.origin, origin);
const index = await fetch(origin, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
assert(index.ok && (await index.text()).includes('JSON catalog for agents'));
const temp = await realpath(await mkdtemp(join(tmpdir(), 'ai-tarballs-smoke-')));
try {
  const names = new Set(catalog.packages.map(p => p.name));
  for (const pkg of catalog.packages) {
    assert.equal(pkg.url, packageUrl(c, pkg.name));
    const response = await fetch(pkg.url, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
    assert(response.ok, `${pkg.name}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(integrity(bytes), pkg.integrity);
    const file = join(temp, packageFile(pkg.name));
    await writeFile(file, bytes);
    const manifest = JSON.parse(execFileSync('tar', ['-xOzf', file, 'package/package.json'], { maxBuffer: 1024 * 1024, encoding: 'utf8' }));
    assert.equal(manifest.name, pkg.name);
    assert.equal(manifest.version, previewVersion(c));
    for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
        assert(!spec.startsWith('workspace:'), 'Unresolved workspace dependency');
        if (names.has(name)) {
          assert.equal(spec, section === 'peerDependencies' ? previewVersion(c) : packageUrl(c, name));
        }
      }
    }
  }
  const selected = ['ai', '@ai-sdk/openai'];
  if (names.has('@ai-sdk/code-mode')) selected.push('@ai-sdk/code-mode');
  for (const manager of ['npm', 'pnpm']) {
    const consumer = join(temp, manager);
    await mkdir(consumer);
    const install = installNames(catalog, selected);
    const dependencies = Object.fromEntries(install.map(name => [name, packageUrl(c, name)]));
    await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies }));
    const args = manager === 'npm'
      ? ['install', '--ignore-scripts', '--no-audit', '--no-fund']
      : ['install', '--ignore-scripts', '--config.blockExoticSubdeps=false', '--store-dir', join(temp, 'store')];
    execFileSync(manager, args, { cwd: consumer, stdio: 'inherit' });
    // Check actual resolution, runtime imports, and dependency versions from
    // an isolated consumer outside the checked-out monorepo.
    await writeFile(join(consumer, 'verify.mjs'), `
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const expected = ${JSON.stringify(previewVersion(c))};
for (const name of ${JSON.stringify(install)}) {
  const path = require.resolve(name);
  assert(realpathSync(path).startsWith(${JSON.stringify(consumer + '/')}));
  assert(path.includes('/dist/'));
  const pkg = require(name + '/package.json');
  assert.equal(pkg.version, expected);
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (!${JSON.stringify([...names])}.includes(dep)) continue;
    const fromPackage = createRequire(path);
    assert.equal(fromPackage(dep + '/package.json').version, expected);
  }
}
const ai = await import('ai');
const openai = await import('@ai-sdk/openai');
assert.equal(typeof ai.generateText, 'function');
assert.equal(typeof openai.createOpenAI, 'function');
`);
    execFileSync('node', ['verify.mjs'], { cwd: consumer, stdio: 'inherit' });
  }
  console.log(`Verified ${catalog.packages.length} public downloads and isolated npm/pnpm installs.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
