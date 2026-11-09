import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const json = async path => JSON.parse(await readFile(path, 'utf8'));
export const integrity = bytes =>
  `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

export function context(value) {
  assert.equal(value.repository, 'vercel/ai');
  assert.match(value.sha, /^[a-f0-9]{40}$/, 'Invalid commit SHA');
  assert(typeof value.branch === 'string' && value.branch.length <= 1024);
  assert(!/[\x00-\x1f\x7f]/.test(value.branch));
  const url = new URL(value.origin);
  assert.equal(url.protocol, 'https:');
  assert.equal(
    url.origin,
    value.origin,
    'Expected a deployment origin without a path',
  );
  assert(!url.username && !url.password);
  if (value.pr !== undefined) {
    assert(Number.isSafeInteger(value.pr) && value.pr > 0, 'Invalid PR number');
  }
  return {
    repository: value.repository,
    sha: value.sha,
    branch: value.branch,
    origin: value.origin,
    ...(value.pr === undefined ? {} : { pr: value.pr }),
  };
}

export function vercelContext(env = process.env) {
  assert(env.VERCEL_URL, 'VERCEL_URL must identify the immutable deployment');
  return context({
    repository: 'vercel/ai',
    sha: env.VERCEL_GIT_COMMIT_SHA,
    branch: env.VERCEL_GIT_COMMIT_REF,
    origin: `https://${env.VERCEL_URL}`,
    ...(env.VERCEL_GIT_PULL_REQUEST_ID
      ? { pr: Number(env.VERCEL_GIT_PULL_REQUEST_ID) }
      : {}),
  });
}

export const previewVersion = c => `0.0.0-preview.${c.sha}`;

export function packagePath(name) {
  assert.match(name, /^(ai|@ai-sdk\/[a-z0-9]+(?:-[a-z0-9]+)*)$/);
  return `/pkg/${name.replace('@', '')}.tgz`;
}

export const packageFile = name =>
  packagePath(name).slice(5).replace('/', '--');
export const packageUrl = (c, name) => `${c.origin}${packagePath(name)}`;

export async function packages(root) {
  const result = [];
  for (const dir of await readdir(join(root, 'packages'))) {
    const path = join(root, 'packages', dir);
    const manifest = await json(join(path, 'package.json'));
    if (manifest.private) continue;
    packagePath(manifest.name);
    result.push({ path, manifest });
  }
  return result.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

export function rewriteManifest(manifest, names, c) {
  const result = structuredClone(manifest);
  result.version = previewVersion(c);
  for (const section of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    for (const [name, spec] of Object.entries(result[section] ?? {})) {
      if (names.has(name)) {
        // Peer dependencies must remain semver, not tarball URLs. Commands also
        // install the peer closure explicitly to avoid falling back to npm.
        result[section][name] =
          section === 'peerDependencies'
            ? previewVersion(c)
            : packageUrl(c, name);
      } else {
        assert(
          !spec.startsWith('workspace:'),
          `Unpublished runtime dependency: ${name}`,
        );
      }
    }
  }
  return result;
}

// Include internal peers reached through dependencies as well as direct peers.
export function installNames(catalog, selected) {
  const byName = new Map(catalog.packages.map(p => [p.name, p]));
  const install = new Set(selected);
  const visited = new Set();
  function visit(name) {
    if (visited.has(name)) return;
    visited.add(name);
    const pkg = byName.get(name);
    assert(pkg, `Missing package: ${name}`);
    for (const peer of pkg.peers) {
      install.add(peer);
      visit(peer);
    }
    for (const dep of pkg.dependencies) visit(dep);
  }
  selected.forEach(visit);
  return [...install].sort();
}

export function installCommand(catalog, selected, manager = 'npm') {
  assert(['npm', 'pnpm'].includes(manager));
  // pnpm 12 blocks transitive tarball URLs by default. Opt in for this one
  // preview installation, without changing the consumer's persistent settings.
  const options =
    manager === 'pnpm' ? '--config.blockExoticSubdeps=false ' : '';
  return `${manager} ${manager === 'npm' ? 'install' : 'add'} ${options}${installNames(
    catalog,
    selected,
  )
    .map(name => `${name}@${packageUrl(catalog.context, name)}`)
    .join(' ')}`;
}

export const escapeHtml = value =>
  String(value).replace(
    /[&<>"']/g,
    char =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  );
