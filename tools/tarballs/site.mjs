// Generate a static package browser and catalog from the packed packages.
import assert from 'node:assert/strict';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  lstat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  context,
  escapeHtml as h,
  integrity,
  installCommand,
  packageFile,
  packagePath,
  packageUrl,
  previewVersion,
} from './shared.mjs';

export async function assemble(input, output, value) {
  const c = context(value);
  const metadataPath = join(input, 'packages.json');
  const metadataStat = await lstat(metadataPath);
  assert(
    metadataStat.isFile() && metadataStat.size < 1024 * 1024,
    'Invalid package metadata',
  );
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  assert(
    Array.isArray(metadata) && metadata.length > 0 && metadata.length <= 200,
  );
  const names = new Set();
  for (const pkg of metadata) {
    packagePath(pkg.name);
    assert(!names.has(pkg.name), 'Duplicate package');
    names.add(pkg.name);
  }
  assert(
    names.has('ai') && names.has('@ai-sdk/openai'),
    'Missing smoke-test packages',
  );
  assert.deepEqual(
    (await readdir(input)).sort(),
    ['packages.json', ...metadata.map(p => packageFile(p.name))].sort(),
    'Unexpected artifact files',
  );
  let total = 0;
  const result = [];
  for (const pkg of metadata) {
    assert.equal(pkg.version, previewVersion(c));
    for (const key of ['dependencies', 'peers']) {
      assert(Array.isArray(pkg[key]) && pkg[key].length <= 200);
      assert(
        pkg[key].every(name => names.has(name)),
        `Unknown ${key}`,
      );
    }
    const source = join(input, packageFile(pkg.name));
    const stat = await lstat(source);
    assert(
      stat.isFile() && stat.size > 0 && stat.size <= 100 * 1024 * 1024,
      'Invalid tarball file',
    );
    total += stat.size;
    assert(total <= 500 * 1024 * 1024, 'Artifact too large');
    const bytes = await readFile(source);
    assert.equal(bytes[0], 0x1f);
    assert.equal(bytes[1], 0x8b);
    assert.equal(integrity(bytes), pkg.integrity, 'Tarball integrity mismatch');
    const target = join(output, packagePath(pkg.name));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    result.push({
      name: pkg.name,
      version: pkg.version,
      path: packagePath(pkg.name),
      url: packageUrl(c, pkg.name),
      integrity: integrity(bytes),
      size: bytes.length,
      dependencies: [...new Set(pkg.dependencies)].sort(),
      peers: [...new Set(pkg.peers)].sort(),
    });
  }
  const catalog = {
    schemaVersion: 1,
    context: c,
    origin: c.origin,
    packages: result,
  };
  for (const pkg of result) {
    pkg.install = {
      npm: installCommand(catalog, [pkg.name]),
      pnpm: installCommand(catalog, [pkg.name], 'pnpm'),
    };
  }
  await writeFile(
    join(output, 'catalog.json'),
    JSON.stringify(catalog, null, 2),
  );
  await mkdir(join(output, 'assets'), { recursive: true });
  await copyFile(
    new URL('./site.css', import.meta.url),
    join(output, 'assets', 'site.css'),
  );
  await writeFile(join(output, 'index.html'), render(catalog));
  return catalog;
}

export function render(catalog) {
  const c = catalog.context;
  const revision = c.pr ? `PR #${c.pr}` : 'Branch preview';
  const command = (value, label) =>
    `<pre class="vbg-custom-command" tabindex="0" role="region" aria-label="${h(label)}"><code>${h(value.replace(/ (?=(?:ai|@ai-sdk\/[^@ ]+)@https:)/g, ' \\\n  '))}</code></pre>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Install unpublished AI SDK packages from a specific Git revision, with matching dependencies and a JSON catalog for agents.">
  <title>AI SDK ${c.pr ? `PR #${c.pr}` : 'preview'} packages</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400..600&amp;family=Geist+Mono:wght@400..600&amp;display=swap" rel="stylesheet" referrerpolicy="no-referrer">
  <link href="https://vercel.com/geist/vercel-brand.css" rel="stylesheet" referrerpolicy="no-referrer">
  <link href="/assets/site.css" rel="stylesheet">
</head>
<body class="vbg-report">
  <div class="vbg-shell">
    <a class="vbg-skip-link" href="#main">Skip to content</a>
    <header class="vbg-header">
      <div class="vbg-masthead">
        <span class="vbg-identity"><span class="vbg-wordmark" role="img" aria-label="Vercel"></span></span>
        <div class="vbg-document-meta">
          <span>AI SDK</span>
          ${c.pr ? `<a href="https://github.com/vercel/ai/pull/${c.pr}">${revision}</a>` : `<span>${revision}</span>`}
        </div>
      </div>
    </header>
    <main id="main" class="vbg-custom-main">
      <section class="vbg-custom-intro" aria-labelledby="title">
        <div class="vbg-stack">
          <h1 id="title" class="vbg-title">Try this AI SDK revision</h1>
          <p class="vbg-lede">Install unreleased packages from this commit. Every download and command uses the same revision.</p>
        </div>
        <dl class="vbg-custom-revision">
          <div class="vbg-custom-revision-field">
            <dt class="vbg-label">Branch</dt>
            <dd class="vbg-custom-identifier"><code>${h(c.branch)}</code></dd>
          </div>
          <div class="vbg-custom-revision-field">
            <dt class="vbg-label">Commit</dt>
            <dd class="vbg-custom-identifier"><a href="https://github.com/vercel/ai/commit/${c.sha}" aria-label="View commit ${c.sha}"><code>${c.sha}</code></a></dd>
          </div>
        </dl>
      </section>
      <section class="vbg-band" data-tone="contrast" aria-labelledby="install-title">
        <div class="vbg-stack">
          <h2 id="install-title" class="vbg-heading-24">Install AI SDK with OpenAI</h2>
          <p>Run in your project to try this revision.</p>
          ${command(installCommand(catalog, ['ai', '@ai-sdk/openai']), 'npm install command')}
          <details class="vbg-custom-manager">
            <summary>Use pnpm</summary>
            ${command(installCommand(catalog, ['ai', '@ai-sdk/openai'], 'pnpm'), 'pnpm install command')}
          </details>
        </div>
      </section>
      <div class="vbg-custom-install-notes">
        <p>Commands include matching AI SDK peers. Runtime dependencies come from this same preview.</p>
        <p>Review the changes before installing. Preview packages are intended for testing.</p>
        <details class="vbg-custom-pnpm-note">
          <summary>About the pnpm option</summary>
          <p>pnpm 12 blocks transitive tarball URLs by default. <code>--config.blockExoticSubdeps=false</code> allows them for this installation without changing your persistent pnpm configuration.</p>
        </details>
      </div>
      <section class="vbg-custom-catalog" aria-labelledby="packages-title">
        <div class="vbg-custom-catalog-heading">
          <div class="vbg-stack">
            <h2 id="packages-title" class="vbg-heading-24">Browse all ${catalog.packages.length} packages</h2>
            <p>Choose a package for its download and install commands.</p>
          </div>
          <a href="/catalog.json">JSON catalog for agents</a>
        </div>
        <p class="vbg-meta">Package version <code class="vbg-custom-identifier">${previewVersion(c)}</code></p>
        <ul class="vbg-custom-packages">
          ${catalog.packages
            .map(
              pkg => `<li class="vbg-custom-package-item">
            <details class="vbg-custom-package">
              <summary><span class="vbg-custom-package-name"><code>${h(pkg.name)}</code></span><span class="vbg-meta">${(pkg.size / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} kB</span></summary>
              <div class="vbg-custom-package-content">
                <a href="${h(pkg.url)}" download>Download <code>${h(pkg.path)}</code></a>
                <p class="vbg-label">npm</p>
                ${command(pkg.install.npm, `npm install ${pkg.name}`)}
                <p class="vbg-label">pnpm</p>
                ${command(pkg.install.pnpm, `pnpm install ${pkg.name}`)}
              </div>
            </details>
          </li>`,
            )
            .join('\n')}
        </ul>
      </section>
    </main>
    <footer class="vbg-footer">
      <span class="vbg-logo" role="img" aria-label="Vercel"></span>
      <span><a href="https://github.com/vercel/ai">vercel/ai</a></span>
    </footer>
  </div>
</body>
</html>`;
}
