// This script and all package lifecycle hooks run only on the unprivileged builder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { context, integrity, packageFile, packages, previewVersion, rewriteManifest } from './shared.mjs';

const c = context(JSON.parse(process.env.TARBALLS_CONTEXT));
const root = resolve(process.argv[2] ?? 'source');
const output = resolve(process.argv[3] ?? 'tarballs');
const all = await packages(root);
const names = new Set(all.map(p => p.manifest.name));
await mkdir(output, { recursive: true });

// tsdown embeds package.json versions in the build. Set them before building,
// while keeping workspace specs intact for Turbo's dependency graph.
for (const { path, manifest } of all) {
  await writeFile(join(path, 'package.json'), JSON.stringify({ ...manifest, version: previewVersion(c) }, null, 2));
}
execFileSync('pnpm', ['run', 'build:packages'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, TURBO_CACHE: 'local:rw', TURBO_FORCE: 'true' },
});

const metadata = [];
for (const { path, manifest } of all) {
  const rewritten = rewriteManifest(manifest, names, c);
  await writeFile(join(path, 'package.json'), JSON.stringify(rewritten, null, 2));
  const temp = await mkdtemp(join(tmpdir(), 'ai-tarball-'));
  try {
    execFileSync('pnpm', ['pack', '--pack-destination', temp], { cwd: path, stdio: 'inherit' });
    const files = await readdir(temp);
    assert.equal(files.length, 1);
    assert(files[0].endsWith('.tgz'));
    const target = join(output, packageFile(manifest.name));
    await rename(join(temp, files[0]), target);
    metadata.push({
      name: manifest.name,
      version: rewritten.version,
      integrity: integrity(await readFile(target)),
      dependencies: [...new Set([
        ...Object.keys(rewritten.dependencies ?? {}),
        ...Object.keys(rewritten.optionalDependencies ?? {}),
      ])].filter(name => names.has(name)).sort(),
      peers: Object.keys(rewritten.peerDependencies ?? {}).filter(name => names.has(name)).sort(),
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
await writeFile(join(output, 'packages.json'), JSON.stringify(metadata));
