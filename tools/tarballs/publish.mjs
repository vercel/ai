import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { context, hostname, sameRevision } from './shared.mjs';
import { assemble } from './site.mjs';

const c = context(JSON.parse(process.env.TARBALLS_CONTEXT));
const team = process.env.VERCEL_ORG_ID;
const project = process.env.VERCEL_PROJECT_ID;
assert.match(team, /^team_[a-zA-Z0-9]+$/);
assert.match(project, /^prj_[a-zA-Z0-9]+$/);
const host = hostname(c);
const origin = `https://${host}`;

async function api(path, allowMissing = false) {
  const response = await fetch(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${team}`, {
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (allowMissing && response.status === 404) return undefined;
  assert(response.ok, `Vercel request failed: ${response.status}`);
  return response.json();
}

const settings = await api(`/v9/projects/${project}`);
assert.equal(settings.id, project);
assert.equal(settings.accountId, team);
assert.equal(settings.name, 'ai-tarballs');
assert(!settings.link, 'The tarball project must have no Git integration');
assert(!settings.ssoProtection, 'Package downloads must be public');
const env = await api(`/v10/projects/${project}/env`);
assert.equal(env.envs.length, 0, 'The static tarball project must have no environment variables');

// An assigned hostname is immutable, including when an earlier smoke check
// failed. A retry may verify it again but must never replace its bytes.
const alias = await api(`/v4/aliases/${host}`, true);
if (alias) {
  assert.equal(alias.projectId, project);
  const response = await fetch(`${origin}/catalog.json`, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
  assert(response.ok, 'Existing alias is unavailable; refusing to retarget it');
  const catalog = await response.json();
  assert(sameRevision(context(catalog.context), c), 'Hostname collision; refusing to overwrite a different revision');
  console.log(`Reusing immutable preview ${origin}`);
} else {
  const root = resolve('deployment');
  await mkdir(join(root, '.vercel'), { recursive: true });
  await assemble(resolve(process.argv[2] ?? 'tarballs'), join(root, '.vercel/output'), c);
  await writeFile(join(root, '.vercel/project.json'), JSON.stringify({ orgId: team, projectId: project }));
  await writeFile(join(root, 'vercel.json'), JSON.stringify({ git: { deploymentEnabled: false } }));
  const deployment = execFileSync('vercel', ['deploy', '--prebuilt', '--yes', '--scope', 'vercel-labs'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
  const url = new URL(deployment);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.origin, deployment);
  assert(url.hostname.endsWith('.vercel.app'));
  // Workflow concurrency serializes publishing, and the API check also makes
  // accidental manual alias reuse fail rather than silently overwrite it.
  assert(!await api(`/v4/aliases/${host}`, true), 'Alias was created during upload');
  execFileSync('vercel', ['alias', 'set', deployment, host, '--scope', 'vercel-labs'], { cwd: root, stdio: 'inherit' });
}
await appendFile(process.env.GITHUB_OUTPUT, `origin=${origin}\n`);
