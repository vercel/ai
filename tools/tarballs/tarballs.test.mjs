import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { comment, commentState, validate } from './github.mjs';
import { assemble } from './site.mjs';
import { context, hostname, integrity, installCommand, installNames, packageFile, packagePath, packageUrl, previewVersion, rewriteManifest } from './shared.mjs';

const c = {
  repository: 'vercel/ai', pr: 12345, branch: 'Fix/Provider_Options',
  headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), sha: 'c'.repeat(40),
  ciRunId: 789, ciAttempt: 1,
};

test('hostnames preserve PR and tested SHA, normalize branches, and fit DNS', () => {
  assert.equal(hostname(c), 'pr-12345-fix-provider-options-cccccccccccc.tarballs.ai-sdk.dev');
  for (const branch of ['/', '🤖', '-'.repeat(100), 'a/'.repeat(200), 'feature/ABC___xyz']) {
    const label = hostname({ ...c, branch }).split('.')[0];
    assert(label.length <= 63);
    assert.match(label, /^pr-12345-[a-z0-9-]+-cccccccccccc$/);
    assert(!label.includes('--'));
  }
  assert.throws(() => context({ ...c, sha: 'oops' }));
  assert.throws(() => context({ ...c, pr: -1 }));
  assert.throws(() => context({ ...c, branch: 'x\ny' }));
});

test('package paths cannot escape static downloads', () => {
  assert.equal(packagePath('ai'), '/pkg/ai.tgz');
  assert.equal(packagePath('@ai-sdk/openai'), '/pkg/ai-sdk/openai.tgz');
  for (const name of ['../ai', '@ai-sdk/../ai', '@other/ai', 'ai.tgz', '@ai-sdk/foo/bar']) {
    assert.throws(() => packagePath(name));
  }
});

test('runtime dependencies use preview URLs, peers use semver, external specs stay intact', () => {
  const manifest = {
    name: '@ai-sdk/tool', version: '1.0.0',
    dependencies: { '@ai-sdk/provider': 'workspace:*', zod: '^4' },
    optionalDependencies: { '@ai-sdk/provider-utils': 'workspace:^' },
    peerDependencies: { ai: 'workspace:^', react: '^19' },
  };
  const names = new Set(['ai', '@ai-sdk/provider', '@ai-sdk/provider-utils']);
  const result = rewriteManifest(manifest, names, c);
  assert.equal(result.dependencies['@ai-sdk/provider'], packageUrl(c, '@ai-sdk/provider'));
  assert.equal(result.optionalDependencies['@ai-sdk/provider-utils'], packageUrl(c, '@ai-sdk/provider-utils'));
  assert.equal(result.peerDependencies.ai, previewVersion(c));
  assert.equal(result.dependencies.zod, '^4');
  assert.equal(result.peerDependencies.react, '^19');
  assert.equal(manifest.version, '1.0.0');
  assert.throws(() => rewriteManifest({ dependencies: { private: 'workspace:*' } }, names, c));
});

test('install commands include internal peers reached through runtime dependencies and cycles', () => {
  const catalog = { context: c, packages: [
    { name: 'ai', dependencies: ['@ai-sdk/provider'], peers: [] },
    { name: '@ai-sdk/provider', dependencies: [], peers: ['@ai-sdk/peer'] },
    { name: '@ai-sdk/peer', dependencies: ['ai'], peers: [] },
  ] };
  assert.deepEqual(installNames(catalog, ['ai']), ['@ai-sdk/peer', 'ai']);
  assert.match(installCommand(catalog, ['ai'], 'pnpm'), /^pnpm add --config.blockExoticSubdeps=false /);
  assert(!installCommand(catalog, ['ai']).includes('blockExoticSubdeps'));
});

function apiFixture(mutate = () => {}) {
  const values = {
    run: { id: c.ciRunId, run_attempt: c.ciAttempt, repository: { full_name: c.repository },
      event: 'pull_request', status: 'completed', conclusion: 'success', head_sha: c.headSha,
      head_branch: c.branch, head_repository: { full_name: 'contributor/ai' }, pull_requests: [], workflow_id: 42 },
    pr: { state: 'open', head: { sha: c.headSha, ref: c.branch, repo: { full_name: 'contributor/ai' } },
      base: { sha: c.baseSha, repo: { full_name: c.repository } }, merge_commit_sha: c.sha },
    workflow: { path: '.github/workflows/ci.yml', name: 'CI' },
    commit: { parents: [{ sha: c.baseSha }, { sha: c.headSha }] },
    jobs: { jobs: [{ name: 'test', head_sha: c.headSha, conclusion: 'success' }] },
  };
  mutate(values);
  return async path => {
    if (path.endsWith('/jobs?per_page=100&page=1')) return values.jobs;
    if (path.startsWith('actions/runs/')) return values.run;
    if (path.startsWith('pulls/')) return values.pr;
    if (path.startsWith('actions/workflows/')) return values.workflow;
    if (path.startsWith('commits/')) return values.commit;
    throw new Error(`Unexpected API path ${path}`);
  };
}

test('fork runs with no PR association are verified through head repository and merge parents', async () => {
  assert.deepEqual(await validate(c, apiFixture()), c);
});

test('publishing fails closed for unsuccessful, stale, mismatched, or partially rerun CI', async () => {
  for (const mutate of [
    v => { v.run.conclusion = 'action_required'; },
    v => { v.run.event = 'pull_request_target'; },
    v => { v.run.run_attempt++; },
    v => { v.pr.head.sha = 'd'.repeat(40); },
    v => { v.pr.base.sha = 'd'.repeat(40); },
    v => { v.pr.state = 'closed'; },
    v => { v.run.head_repository.full_name = 'someone/else'; },
    v => { v.workflow.path = '.github/workflows/other.yml'; },
    v => { v.commit.parents = [{ sha: c.headSha }]; },
    v => { v.jobs.jobs[0].conclusion = 'skipped'; },
    v => { v.jobs.jobs = []; },
    v => { v.run.pull_requests = [{ number: 1 }]; },
  ]) await assert.rejects(() => validate(c, apiFixture(mutate)));
});

test('one bot comment progresses, preserves the previous ready revision, and rejects older updates', async () => {
  const comments = [];
  const api = async (path, method = 'GET', body) => {
    if (path.startsWith('pulls/')) return { state: 'open', head: { sha: c.headSha }, base: { sha: c.baseSha } };
    if (method === 'POST') {
      comments.push({ id: 1, user: { login: 'github-actions[bot]' }, ...body });
      return comments[0];
    }
    if (method === 'PATCH') { Object.assign(comments[0], body); return comments[0]; }
    return comments;
  };
  await comment(c, 'preparing', api);
  assert.match(comments[0].body, /Creating a package preview/);
  await comment(c, 'ready', api);
  assert.equal(comments.length, 1);
  assert.equal(commentState(comments[0].body).ready.sha, c.sha);
  const next = { ...c, ciRunId: c.ciRunId + 1, sha: 'd'.repeat(40) };
  await comment(next, 'preparing', api);
  assert.match(comments[0].body, /Previous successful preview/);
  const body = comments[0].body;
  await comment(c, 'failed', api);
  assert.equal(comments[0].body, body);
  await comment(next, 'cancelled', api);
  assert.match(comments[0].body, /preview cancelled/);
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ai-tarball-test-'));
  const input = join(root, 'input');
  await mkdir(input);
  const metadata = [];
  for (const name of ['ai', '@ai-sdk/openai']) {
    const bytes = gzipSync(`test ${name}`);
    await writeFile(join(input, packageFile(name)), bytes);
    metadata.push({ name, version: previewVersion(c), integrity: integrity(bytes), dependencies: [], peers: [] });
  }
  await writeFile(join(input, 'packages.json'), JSON.stringify(metadata));
  return { root, input, output: join(root, 'output'), metadata };
}

test('publisher constructs only static output and escapes branch markup', async () => {
  const f = await fixture();
  try {
    await assemble(f.input, f.output, { ...c, branch: '<img src=x onerror=alert(1)>' });
    assert.deepEqual((await readdir(f.output)).sort(), ['config.json', 'static']);
    const html = await readFile(join(f.output, 'static/index.html'), 'utf8');
    assert(!html.includes('<img'));
    assert(html.includes('&lt;img'));
    assert(!html.includes('<script'));
    const config = JSON.parse(await readFile(join(f.output, 'config.json'), 'utf8'));
    assert.equal(config.version, 3);
    assert.equal(config.routes.at(-1).handle, 'filesystem');
    const catalog = JSON.parse(await readFile(join(f.output, 'static/catalog.json'), 'utf8'));
    assert.equal(catalog.packages[0].path, '/pkg/ai.tgz');
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('publisher rejects injected files, symlinks, false versions, and corrupted bytes', async () => {
  for (const mutate of [
    async f => writeFile(join(f.input, 'vercel.json'), '{}'),
    async f => { await rm(join(f.input, 'ai.tgz')); await symlink('/etc/hosts', join(f.input, 'ai.tgz')); },
    async f => { f.metadata[0].version = '1.0.0'; await writeFile(join(f.input, 'packages.json'), JSON.stringify(f.metadata)); },
    async f => writeFile(join(f.input, 'ai.tgz'), gzipSync('corrupted')),
  ]) {
    const f = await fixture();
    try { await mutate(f); await assert.rejects(() => assemble(f.input, f.output, c)); }
    finally { await rm(f.root, { recursive: true, force: true }); }
  }
});

test('real pack lifecycle embeds preview versions before build and rewrites packed dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ai-tarball-pack-'));
  const output = join(root, 'tarballs');
  try {
    const definitions = [
      { name: 'ai', dir: 'ai', dependencies: { '@ai-sdk/provider': 'workspace:*' } },
      { name: '@ai-sdk/openai', dir: 'openai', dependencies: { '@ai-sdk/provider': 'workspace:^' }, peerDependencies: { ai: 'workspace:*' } },
      { name: '@ai-sdk/provider', dir: 'provider' },
    ];
    for (const pkg of definitions) {
      await mkdir(join(root, 'packages', pkg.dir), { recursive: true });
      await writeFile(join(root, 'packages', pkg.dir, 'package.json'), JSON.stringify({ ...pkg, version: '1.0.0', files: ['dist'], type: 'module' }));
    }
    await writeFile(join(root, 'package.json'), JSON.stringify({ private: true, scripts: { 'build:packages': 'node build.mjs' } }));
    await writeFile(join(root, 'build.mjs'), `
import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
for (const dir of readdirSync('packages')) {
  const path = 'packages/' + dir;
  const pkg = JSON.parse(readFileSync(path + '/package.json'));
  mkdirSync(path + '/dist');
  writeFileSync(path + '/dist/index.js', 'export const version = ' + JSON.stringify(pkg.version));
}`);
    execFileSync('node', [resolve('tools/tarballs/pack.mjs'), root, output], {
      env: { ...process.env, TARBALLS_CONTEXT: JSON.stringify(c) }, stdio: 'pipe',
    });
    for (const pkg of definitions) {
      const file = join(output, packageFile(pkg.name));
      const manifest = JSON.parse(execFileSync('tar', ['-xOzf', file, 'package/package.json'], { encoding: 'utf8' }));
      assert.equal(manifest.version, previewVersion(c));
      const built = execFileSync('tar', ['-xOzf', file, 'package/dist/index.js'], { encoding: 'utf8' });
      assert(built.includes(previewVersion(c)));
      if (pkg.dependencies) assert.equal(manifest.dependencies['@ai-sdk/provider'], packageUrl(c, '@ai-sdk/provider'));
      if (pkg.peerDependencies) assert.equal(manifest.peerDependencies.ai, previewVersion(c));
    }
    await assemble(output, join(root, 'site'), c);
  } finally { await rm(root, { recursive: true, force: true }); }
});
