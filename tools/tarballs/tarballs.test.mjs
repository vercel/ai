import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { assemble } from './site.mjs';
import {
  context,
  vercelContext,
  integrity,
  installCommand,
  installNames,
  packageFile,
  packagePath,
  packageUrl,
  previewVersion,
  rewriteManifest,
} from './shared.mjs';

const c = {
  repository: 'vercel/ai',
  pr: 12345,
  branch: 'Fix/Provider_Options',
  sha: 'c'.repeat(40),
  origin: 'https://ai-tarballs-abc123-vercel-labs.vercel.app',
};

test('Vercel metadata uses the immutable deployment origin and supports builds before a PR exists', () => {
  const env = {
    VERCEL_URL: new URL(c.origin).host,
    VERCEL_GIT_COMMIT_SHA: c.sha,
    VERCEL_GIT_COMMIT_REF: c.branch,
    VERCEL_GIT_PULL_REQUEST_ID: String(c.pr),
  };
  assert.deepEqual(vercelContext(env), c);
  const { pr, ...withoutPR } = c;
  assert.deepEqual(
    vercelContext({ ...env, VERCEL_GIT_PULL_REQUEST_ID: '' }),
    withoutPR,
  );
  assert.throws(() => vercelContext({ ...env, VERCEL_URL: undefined }));
  assert.throws(() => context({ ...c, sha: 'oops' }));
  assert.throws(() => context({ ...c, pr: -1 }));
  assert.throws(() => context({ ...c, branch: 'x\ny' }));
  for (const origin of [
    'http://example.com',
    c.origin + '/path',
    'https://user:pass@example.com',
  ]) {
    assert.throws(() => context({ ...c, origin }));
  }
  assert.equal(packageUrl(c, 'ai'), c.origin + '/pkg/ai.tgz');
});

test('package paths cannot escape static downloads', () => {
  assert.equal(packagePath('ai'), '/pkg/ai.tgz');
  assert.equal(packagePath('@ai-sdk/openai'), '/pkg/ai-sdk/openai.tgz');
  for (const name of [
    '../ai',
    '@ai-sdk/../ai',
    '@other/ai',
    'ai.tgz',
    '@ai-sdk/foo/bar',
  ]) {
    assert.throws(() => packagePath(name));
  }
});

test('runtime dependencies use preview URLs, peers use semver, external specs stay intact', () => {
  const manifest = {
    name: '@ai-sdk/tool',
    version: '1.0.0',
    dependencies: { '@ai-sdk/provider': 'workspace:*', zod: '^4' },
    optionalDependencies: { '@ai-sdk/provider-utils': 'workspace:^' },
    peerDependencies: { ai: 'workspace:^', react: '^19' },
  };
  const names = new Set(['ai', '@ai-sdk/provider', '@ai-sdk/provider-utils']);
  const result = rewriteManifest(manifest, names, c);
  assert.equal(
    result.dependencies['@ai-sdk/provider'],
    packageUrl(c, '@ai-sdk/provider'),
  );
  assert.equal(
    result.optionalDependencies['@ai-sdk/provider-utils'],
    packageUrl(c, '@ai-sdk/provider-utils'),
  );
  assert.equal(result.peerDependencies.ai, previewVersion(c));
  assert.equal(result.dependencies.zod, '^4');
  assert.equal(result.peerDependencies.react, '^19');
  assert.equal(manifest.version, '1.0.0');
  assert.throws(() =>
    rewriteManifest({ dependencies: { private: 'workspace:*' } }, names, c),
  );
});

test('install commands include internal peers reached through runtime dependencies and cycles', () => {
  const catalog = {
    context: c,
    packages: [
      { name: 'ai', dependencies: ['@ai-sdk/provider'], peers: [] },
      { name: '@ai-sdk/provider', dependencies: [], peers: ['@ai-sdk/peer'] },
      { name: '@ai-sdk/peer', dependencies: ['ai'], peers: [] },
    ],
  };
  assert.deepEqual(installNames(catalog, ['ai']), ['@ai-sdk/peer', 'ai']);
  assert.match(
    installCommand(catalog, ['ai'], 'pnpm'),
    /^pnpm add --config.blockExoticSubdeps=false /,
  );
  assert(!installCommand(catalog, ['ai']).includes('blockExoticSubdeps'));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ai-tarball-test-'));
  const input = join(root, 'input');
  await mkdir(input);
  const metadata = [];
  for (const name of ['ai', '@ai-sdk/openai']) {
    const bytes = gzipSync(`test ${name}`);
    await writeFile(join(input, packageFile(name)), bytes);
    metadata.push({
      name,
      version: previewVersion(c),
      integrity: integrity(bytes),
      dependencies: [],
      peers: [],
    });
  }
  await writeFile(join(input, 'packages.json'), JSON.stringify(metadata));
  return { root, input, output: join(root, 'output'), metadata };
}

test('package browser emits static downloads and escapes branch markup', async () => {
  const f = await fixture();
  try {
    await assemble(f.input, f.output, {
      ...c,
      branch: '<img src=x onerror=alert(1)>',
    });
    assert.deepEqual((await readdir(f.output)).sort(), [
      'catalog.json',
      'index.html',
      'pkg',
    ]);
    const html = await readFile(join(f.output, 'index.html'), 'utf8');
    assert(!html.includes('<img'));
    assert(html.includes('&lt;img'));
    assert(!html.includes('<script'));
    const catalog = JSON.parse(
      await readFile(join(f.output, 'catalog.json'), 'utf8'),
    );
    assert.equal(catalog.packages[0].path, '/pkg/ai.tgz');
    assert.equal(catalog.origin, c.origin);
    assert.equal(catalog.packages[1].url, c.origin + '/pkg/ai-sdk/openai.tgz');
    assert(!html.includes('Passing CI'));
    await assemble(f.input, f.output, { ...c, pr: undefined });
    assert(
      !(await readFile(join(f.output, 'index.html'), 'utf8')).includes(
        'PR #undefined',
      ),
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('site rejects injected files, symlinks, false versions, and corrupted bytes', async () => {
  for (const mutate of [
    async f => writeFile(join(f.input, 'vercel.json'), '{}'),
    async f => {
      await rm(join(f.input, 'ai.tgz'));
      await symlink('/etc/hosts', join(f.input, 'ai.tgz'));
    },
    async f => {
      f.metadata[0].version = '1.0.0';
      await writeFile(
        join(f.input, 'packages.json'),
        JSON.stringify(f.metadata),
      );
    },
    async f => writeFile(join(f.input, 'ai.tgz'), gzipSync('corrupted')),
  ]) {
    const f = await fixture();
    try {
      await mutate(f);
      await assert.rejects(() => assemble(f.input, f.output, c));
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  }
});

test('real pack lifecycle embeds preview versions before build and rewrites packed dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ai-tarball-pack-'));
  const output = join(root, 'tarballs');
  try {
    const definitions = [
      {
        name: 'ai',
        dir: 'ai',
        dependencies: { '@ai-sdk/provider': 'workspace:*' },
      },
      {
        name: '@ai-sdk/openai',
        dir: 'openai',
        dependencies: { '@ai-sdk/provider': 'workspace:^' },
        peerDependencies: { ai: 'workspace:*' },
      },
      { name: '@ai-sdk/provider', dir: 'provider' },
    ];
    for (const pkg of definitions) {
      await mkdir(join(root, 'packages', pkg.dir), { recursive: true });
      await writeFile(
        join(root, 'packages', pkg.dir, 'package.json'),
        JSON.stringify({
          ...pkg,
          version: '1.0.0',
          files: ['dist'],
          type: 'module',
        }),
      );
    }
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({
        private: true,
        scripts: { 'build:packages': 'node build.mjs' },
      }),
    );
    await writeFile(
      join(root, 'build.mjs'),
      `
import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
for (const dir of readdirSync('packages')) {
  const path = 'packages/' + dir;
  const pkg = JSON.parse(readFileSync(path + '/package.json'));
  mkdirSync(path + '/dist');
  writeFileSync(path + '/dist/index.js', 'export const version = ' + JSON.stringify(pkg.version));
}`,
    );
    execFileSync('node', [resolve('tools/tarballs/pack.mjs'), root, output], {
      env: { ...process.env, TARBALLS_CONTEXT: JSON.stringify(c) },
      stdio: 'pipe',
    });
    for (const pkg of definitions) {
      assert.equal(
        JSON.parse(
          await readFile(
            join(root, 'packages', pkg.dir, 'package.json'),
            'utf8',
          ),
        ).version,
        '1.0.0',
      );
      const file = join(output, packageFile(pkg.name));
      const manifest = JSON.parse(
        execFileSync('tar', ['-xOzf', file, 'package/package.json'], {
          encoding: 'utf8',
        }),
      );
      assert.equal(manifest.version, previewVersion(c));
      const built = execFileSync(
        'tar',
        ['-xOzf', file, 'package/dist/index.js'],
        { encoding: 'utf8' },
      );
      assert(built.includes(previewVersion(c)));
      if (pkg.dependencies)
        assert.equal(
          manifest.dependencies['@ai-sdk/provider'],
          packageUrl(c, '@ai-sdk/provider'),
        );
      if (pkg.peerDependencies)
        assert.equal(manifest.peerDependencies.ai, previewVersion(c));
    }
    await assemble(output, join(root, 'site'), c);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('failed builds restore the original package manifests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ai-tarball-fail-'));
  try {
    await mkdir(join(root, 'packages/ai'), { recursive: true });
    const original = '{"name":"ai","version":"1.0.0"}\n';
    await writeFile(join(root, 'packages/ai/package.json'), original);
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({
        private: true,
        scripts: { 'build:packages': 'node -e "process.exit(1)"' },
      }),
    );
    assert.throws(() =>
      execFileSync(
        'node',
        [resolve('tools/tarballs/pack.mjs'), root, join(root, 'packed')],
        {
          env: { ...process.env, TARBALLS_CONTEXT: JSON.stringify(c) },
          stdio: 'pipe',
        },
      ),
    );
    assert.equal(
      await readFile(join(root, 'packages/ai/package.json'), 'utf8'),
      original,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
