// Only trusted default-branch code runs here. The artifact is data, never code.
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { context, escapeHtml as h, hostname, integrity, installCommand, packageFile, packagePath, packageUrl, previewVersion } from './shared.mjs';

export async function assemble(input, output, value) {
  const c = context(value);
  const metadataPath = join(input, 'packages.json');
  const metadataStat = await lstat(metadataPath);
  assert(metadataStat.isFile() && metadataStat.size < 1024 * 1024, 'Invalid package metadata');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  assert(Array.isArray(metadata) && metadata.length > 0 && metadata.length <= 200);
  const names = new Set();
  for (const pkg of metadata) {
    packagePath(pkg.name);
    assert(!names.has(pkg.name), 'Duplicate package');
    names.add(pkg.name);
  }
  assert(names.has('ai') && names.has('@ai-sdk/openai'), 'Missing smoke-test packages');
  assert.deepEqual((await readdir(input)).sort(), ['packages.json', ...metadata.map(p => packageFile(p.name))].sort(), 'Unexpected artifact files');
  let total = 0;
  const result = [];
  for (const pkg of metadata) {
    assert.equal(pkg.version, previewVersion(c));
    for (const key of ['dependencies', 'peers']) {
      assert(Array.isArray(pkg[key]) && pkg[key].length <= 200);
      assert(pkg[key].every(name => names.has(name)), `Unknown ${key}`);
    }
    const source = join(input, packageFile(pkg.name));
    const stat = await lstat(source);
    assert(stat.isFile() && stat.size > 0 && stat.size <= 100 * 1024 * 1024, 'Invalid tarball file');
    total += stat.size;
    assert(total <= 500 * 1024 * 1024, 'Artifact too large');
    const bytes = await readFile(source);
    assert.equal(bytes[0], 0x1f);
    assert.equal(bytes[1], 0x8b);
    assert.equal(integrity(bytes), pkg.integrity, 'Tarball integrity mismatch');
    const target = join(output, 'static', packagePath(pkg.name));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    result.push({
      name: pkg.name, version: pkg.version, path: packagePath(pkg.name), url: packageUrl(c, pkg.name),
      integrity: integrity(bytes), size: bytes.length,
      dependencies: [...new Set(pkg.dependencies)].sort(), peers: [...new Set(pkg.peers)].sort(),
    });
  }
  const catalog = { schemaVersion: 1, context: c, origin: `https://${hostname(c)}`, packages: result };
  for (const pkg of result) {
    pkg.install = {
      npm: installCommand(catalog, [pkg.name]),
      pnpm: installCommand(catalog, [pkg.name], 'pnpm'),
    };
  }
  await writeFile(join(output, 'static', 'catalog.json'), JSON.stringify(catalog, null, 2));
  await writeFile(join(output, 'static', 'index.html'), render(catalog));
  await writeFile(join(output, 'config.json'), JSON.stringify({
    version: 3,
    routes: [
      { src: '/pkg/(.*)', headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment' }, continue: true },
      { src: '/(.*)', headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      }, continue: true },
      { handle: 'filesystem' },
    ],
  }));
  return catalog;
}

export function render(catalog) {
  const c = catalog.context;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI SDK PR #${c.pr} packages</title>
<style>body{font:16px system-ui;max-width:1100px;margin:3rem auto;padding:0 1rem;line-height:1.5}pre{overflow:auto;background:#f3f3f3;padding:1rem}code{font-size:.85rem}td,th{text-align:left;padding:.75rem;border-bottom:1px solid #ddd}table{width:100%;border-collapse:collapse}a{color:#075ac9}</style></head>
<body><h1>AI SDK PR #${c.pr} packages</h1>
<p>Unreleased packages built from this pull request. Review the changes before installing.</p>
<p><a href="https://github.com/vercel/ai/pull/${c.pr}">Pull request</a> · branch <code>${h(c.branch)}</code><br>
Head: <code>${c.headSha}</code><br>Packaged/tested merge: <code>${c.sha}</code></p>
<p><a href="https://github.com/vercel/ai/actions/runs/${c.ciRunId}/attempts/${c.ciAttempt}">Passing CI</a> · <a href="/catalog.json">JSON catalog for agents</a></p>
<h2>Try AI SDK with OpenAI</h2><pre>${h(installCommand(catalog, ['ai', '@ai-sdk/openai']))}</pre>
<p>Each command includes the matching internal peer packages. Runtime dependencies use tarballs from this same preview.</p>
<h2>Packages</h2><table><thead><tr><th>Package</th><th>Install</th></tr></thead><tbody>
${catalog.packages.map(pkg => `<tr><td><a href="${pkg.path}">${h(pkg.name)}</a><br><code>${pkg.version}</code></td><td><pre>${h(pkg.install.npm)}</pre><pre>${h(pkg.install.pnpm)}</pre></td></tr>`).join('\n')}
</tbody></table></body></html>`;
}
