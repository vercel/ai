import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { context, hostname, json, marker } from './shared.mjs';

const repository = 'vercel/ai';
export async function github(path, method = 'GET', body) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      method,
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (method === 'GET' && response.status >= 500 && attempt < 2) {
      await response.arrayBuffer();
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    assert(response.ok, `GitHub ${method} ${path}: ${response.status}`);
    return response.status === 204 ? undefined : response.json();
  }
}

export async function validate(value, api = github) {
  const c = context(value);
  const [run, pr] = await Promise.all([
    api(`actions/runs/${c.ciRunId}/attempts/${c.ciAttempt}`),
    api(`pulls/${c.pr}`),
  ]);
  // Repository setup must require approval for all external contributors.
  // GITHUB_TOKEN cannot read that administration setting; see the setup guide.
  assert.equal(run.repository.full_name, repository);
  assert.equal(run.event, 'pull_request');
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'success');
  assert.equal(run.id, c.ciRunId);
  assert.equal(run.run_attempt, c.ciAttempt);
  assert.equal(run.head_sha, c.headSha);
  assert.equal(pr.state, 'open', 'PR is closed');
  assert.equal(pr.head.sha, c.headSha, 'PR head changed');
  assert.equal(pr.base.sha, c.baseSha, 'PR base changed; rerun CI for the new merge');
  assert.equal(pr.base.repo.full_name, repository);
  assert.equal(pr.head.ref, c.branch);
  assert.equal(run.head_branch, c.branch);
  assert.equal(run.head_repository.full_name, pr.head.repo.full_name);
  if (run.pull_requests.length) {
    assert(run.pull_requests.some(p => p.number === c.pr), 'Run belongs to another PR');
  }
  const [workflow, commit] = await Promise.all([
    api(`actions/workflows/${run.workflow_id}`),
    api(`commits/${c.sha}`),
  ]);
  assert.equal(workflow.path, '.github/workflows/ci.yml');
  assert.equal(workflow.name, 'CI');
  assert.equal(pr.merge_commit_sha, c.sha, 'Tested merge is no longer current');
  assert.deepEqual(commit.parents.map(p => p.sha).sort(), [c.baseSha, c.headSha].sort());
  // Require the aggregate test job, including on partial workflow reruns.
  // The attempt endpoint includes jobs from that attempt only: fail closed if
  // the aggregate test job wasn't rerun, rather than assuming older results.
  let tested = false;
  for (let page = 1; ; page++) {
    const result = await api(`actions/runs/${c.ciRunId}/attempts/${c.ciAttempt}/jobs?per_page=100&page=${page}`);
    for (const job of result.jobs) {
      assert.equal(job.head_sha, c.headSha);
      if (job.name === 'test') {
        assert.equal(job.conclusion, 'success');
        tested = true;
      }
    }
    if (result.jobs.length < 100) break;
  }
  assert(tested, 'Aggregate test job must pass in this CI attempt; rerun all jobs');
  return c;
}

export function commentState(body) {
  const match = body?.match(/<!-- ai-sdk-tarballs-state (.+) -->/);
  if (!match) return undefined;
  try { return JSON.parse(match[1]); } catch { return undefined; }
}

export function newer(a, b) {
  return a.ciRunId > b.ciRunId || (a.ciRunId === b.ciRunId && a.ciAttempt > b.ciAttempt);
}

export async function comment(c, status, api = github) {
  const pr = await api(`pulls/${c.pr}`);
  if (pr.state !== 'open' || pr.head.sha !== c.headSha || pr.base.sha !== c.baseSha) return;
  const comments = [];
  for (let page = 1; ; page++) {
    const values = await api(`issues/${c.pr}/comments?per_page=100&page=${page}`);
    comments.push(...values);
    if (values.length < 100) break;
  }
  const existing = comments.find(p => p.user.login === 'github-actions[bot]' && p.body.startsWith(marker));
  const previous = commentState(existing?.body);
  if (previous && newer(previous, c)) return;
  const origin = `https://${hostname(c)}`;
  const ready = status === 'ready' ? { sha: c.sha, origin } : previous?.ready;
  const state = { ciRunId: c.ciRunId, ciAttempt: c.ciAttempt, ready };
  const workflowUrl = `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const lines = [marker, '### AI SDK package preview', ''];
  if (status === 'preparing') lines.push('⏳ Creating a package preview after approved CI passed.');
  else if (status === 'ready') {
    lines.push(`✅ [Package preview ready](${origin}) — public downloads and npm/pnpm installs verified.`, '',
      '```sh', `npm install ai@${origin}/pkg/ai.tgz @ai-sdk/openai@${origin}/pkg/ai-sdk/openai.tgz`, '```', '',
      `[All packages and install commands](${origin}) · [Machine-readable catalog](${origin}/catalog.json)`);
  } else lines.push(`⚠️ Package preview ${status}. See the workflow for details.`);
  lines.push('', `PR head: \`${c.headSha}\` · Packaged/tested merge: \`${c.sha}\``, '',
    `[CI run](https://github.com/${repository}/actions/runs/${c.ciRunId}/attempts/${c.ciAttempt}) · [Preview workflow](${workflowUrl})`);
  if (status !== 'ready' && ready) {
    lines.push('', `Previous successful preview: [\`${ready.sha}\`](${ready.origin}) (for that revision).`);
  }
  lines.push('', `<!-- ai-sdk-tarballs-state ${JSON.stringify(state)} -->`);
  const body = lines.join('\n');
  if (existing) await api(`issues/comments/${existing.id}`, 'PATCH', { body });
  else await api(`issues/${c.pr}/comments`, 'POST', { body });
}

async function main() {
  const command = process.argv[2];
  if (command === 'validate') {
    const event = await json(process.env.GITHUB_EVENT_PATH);
    assert.equal(event.workflow_run.event, 'pull_request');
    const c = context(await json(process.argv[3]));
    assert.equal(event.workflow_run.id, c.ciRunId);
    assert.equal(event.workflow_run.run_attempt, c.ciAttempt);
    await validate(c);
    await appendFile(process.env.GITHUB_OUTPUT, `context=${JSON.stringify(c)}\npr=${c.pr}\nsha=${c.sha}\n`);
  } else {
    const c = context(JSON.parse(process.env.TARBALLS_CONTEXT));
    if (command === 'revalidate') await validate(c);
    else if (command === 'comment') {
      assert(['preparing', 'ready', 'failed', 'cancelled'].includes(process.argv[3]));
      await comment(c, process.argv[3]);
    } else throw new Error('Unknown command');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
