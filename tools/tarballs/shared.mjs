import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const domain = 'tarballs.ai-sdk.dev';
export const marker = '<!-- ai-sdk-tarballs -->';
export const json = async path => JSON.parse(await readFile(path, 'utf8'));
export const integrity = bytes =>
  `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

export function context(value) {
  assert.equal(value.repository, 'vercel/ai');
  for (const key of ['pr', 'ciRunId', 'ciAttempt']) {
    assert(Number.isSafeInteger(value[key]) && value[key] > 0, `Invalid ${key}`);
  }
  for (const key of ['sha', 'headSha', 'baseSha']) {
    assert.match(value[key], /^[a-f0-9]{40}$/, `Invalid ${key}`);
  }
  assert(typeof value.branch === 'string' && value.branch.length <= 1024);
  assert(!/[\x00-\x1f\x7f]/.test(value.branch));
  // Reconstruct rather than carrying unknown artifact properties forward.
  return Object.fromEntries(
    ['repository', 'pr', 'branch', 'sha', 'headSha', 'baseSha', 'ciRunId', 'ciAttempt']
      .map(key => [key, value[key]]),
  );
}

export function hostname(value) {
  const c = context(value);
  const prefix = `pr-${c.pr}-`;
  const suffix = `-${c.sha.slice(0, 12)}`;
  const branch = c.branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'branch';
  const label = branch.slice(0, 63 - prefix.length - suffix.length).replace(/-+$/g, '');
  assert(label.length > 0);
  return `${prefix}${label}${suffix}.${domain}`;
}

export const previewVersion = c => `0.0.0-pr.${c.pr}.${c.sha}`;

export function packagePath(name) {
  assert.match(name, /^(ai|@ai-sdk\/[a-z0-9]+(?:-[a-z0-9]+)*)$/);
  return `/pkg/${name.replace('@', '')}.tgz`;
}

export const packageFile = name => packagePath(name).slice(5).replace('/', '--');
export const packageUrl = (c, name) => `https://${hostname(c)}${packagePath(name)}`;

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
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, spec] of Object.entries(result[section] ?? {})) {
      if (names.has(name)) {
        // Peer dependencies must remain semver, not tarball URLs. Commands also
        // install the peer closure explicitly to avoid falling back to npm.
        result[section][name] = section === 'peerDependencies'
          ? previewVersion(c) : packageUrl(c, name);
      } else {
        assert(!spec.startsWith('workspace:'), `Unpublished runtime dependency: ${name}`);
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
  return `${manager} ${manager === 'npm' ? 'install' : 'add'} ${installNames(catalog, selected)
    .map(name => `${name}@${packageUrl(catalog.context, name)}`).join(' ')}`;
}

export function sameRevision(a, b) {
  return ['repository', 'pr', 'sha', 'headSha', 'baseSha', 'branch'].every(key => a[key] === b[key]);
}

export const escapeHtml = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
