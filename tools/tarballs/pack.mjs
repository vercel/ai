// Package builds and lifecycle hooks run in the Vercel build, without deployment credentials.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  context,
  integrity,
  packageFile,
  packages,
  previewVersion,
  rewriteManifest,
} from './shared.mjs';

export async function pack(root, output, value) {
  const c = context(value);
  const all = await packages(root);
  const names = new Set(all.map(p => p.manifest.name));
  await mkdir(output, { recursive: true });
  const originals = await Promise.all(
    all.map(async ({ path }) => [
      join(path, 'package.json'),
      await readFile(join(path, 'package.json'), 'utf8'),
    ]),
  );
  // Installation already verified the lockfile. Do not let pnpm reinstall while
  // these manifests temporarily contain preview versions and tarball URLs.
  const env = {
    ...process.env,
    pnpm_config_verify_deps_before_run: 'false',
  };
  try {
    // tsdown embeds package.json versions in the build. Set them before building,
    // while keeping workspace specs intact for Turbo's dependency graph.
    for (const { path, manifest } of all) {
      await writeFile(
        join(path, 'package.json'),
        JSON.stringify({ ...manifest, version: previewVersion(c) }, null, 2),
      );
    }
    execFileSync('pnpm', ['run', 'build:packages'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...env, TURBO_CACHE: 'local:rw', TURBO_FORCE: 'true' },
    });

    const metadata = [];
    for (const { path, manifest } of all) {
      const rewritten = rewriteManifest(manifest, names, c);
      await writeFile(
        join(path, 'package.json'),
        JSON.stringify(rewritten, null, 2),
      );
      const temp = await mkdtemp(join(tmpdir(), 'ai-tarball-'));
      try {
        execFileSync('pnpm', ['pack', '--pack-destination', temp], {
          cwd: path,
          stdio: 'inherit',
          env,
        });
        const files = await readdir(temp);
        assert.equal(files.length, 1);
        assert(files[0].endsWith('.tgz'));
        const target = join(output, packageFile(manifest.name));
        // Vercel's temporary directory and checkout can be separate mounts.
        await copyFile(join(temp, files[0]), target);
        metadata.push({
          name: manifest.name,
          version: rewritten.version,
          integrity: integrity(await readFile(target)),
          dependencies: [
            ...new Set([
              ...Object.keys(rewritten.dependencies ?? {}),
              ...Object.keys(rewritten.optionalDependencies ?? {}),
            ]),
          ]
            .filter(name => names.has(name))
            .sort(),
          peers: Object.keys(rewritten.peerDependencies ?? {})
            .filter(name => names.has(name))
            .sort(),
        });
      } finally {
        await rm(temp, { recursive: true, force: true });
      }
    }
    await writeFile(join(output, 'packages.json'), JSON.stringify(metadata));
  } finally {
    await Promise.all(
      originals.map(([path, content]) => writeFile(path, content)),
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await pack(
    resolve(process.argv[2] ?? '.'),
    resolve(process.argv[3] ?? 'packed'),
    JSON.parse(process.env.TARBALLS_CONTEXT),
  );
}
