// @ts-check

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Octokit } from 'octokit';

/**
 * @typedef {{ name: string; version: string; private?: boolean }} PackageJson
 * @typedef {{ name: string; version: string }} PublishedPackage
 */

/**
 * Select the public packages versioned by the current snapshot run.
 *
 * @param {PackageJson[]} packageJsons
 * @param {string} shortSha
 * @returns {PublishedPackage[]}
 */
export function selectSnapshotPackages(packageJsons, shortSha) {
  const versionPrefix = `0.0.0-${shortSha}-`;

  return packageJsons
    .filter(
      pkg =>
        pkg.private !== true &&
        typeof pkg.name === 'string' &&
        typeof pkg.version === 'string' &&
        pkg.version.startsWith(versionPrefix),
    )
    .map(({ name, version }) => ({ name, version }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Find the pull request that matches the workflow branch. The associated pull
 * requests API already anchors the candidates to the workflow commit, while
 * matching the branch still works if the PR receives another commit during the
 * snapshot build.
 *
 * @param {Array<{ number: number; state: string; head: { ref: string; repo: { full_name: string } | null } }>} pullRequests
 * @param {string} refName
 * @param {string} repository
 */
export function selectPullRequest(pullRequests, refName, repository) {
  const matches = pullRequests.filter(
    pullRequest =>
      pullRequest.state === 'open' &&
      pullRequest.head.ref === refName &&
      pullRequest.head.repo?.full_name === repository,
  );

  if (matches.length > 1) {
    throw new Error(
      `Found multiple open pull requests for ${repository}:${refName}: ${matches
        .map(pullRequest => `#${pullRequest.number}`)
        .join(', ')}`,
    );
  }

  return matches[0] ?? null;
}

/**
 * @param {PublishedPackage[]} publishedPackages
 * @param {string} runUrl
 */
export function createSnapshotComment(publishedPackages, runUrl) {
  const packageTable = publishedPackages
    .map(pkg => {
      const npmUrl = `https://www.npmjs.com/package/${encodeURIComponent(pkg.name)}/v/${encodeURIComponent(pkg.version)}`;
      return `| \`${pkg.name}\` | [${pkg.version}](${npmUrl}) |`;
    })
    .join('\n');

  return `:test_tube: Snapshot release published:

| Package | Version |
| --- | --- |
${packageTable}

[View workflow run](${runUrl})`;
}

/**
 * @param {string} packagesDirectory
 * @param {string} shortSha
 */
async function findSnapshotPackages(packagesDirectory, shortSha) {
  const entries = await fs.readdir(packagesDirectory, { withFileTypes: true });
  const packageJsons = await Promise.all(
    entries
      .filter(entry => entry.isDirectory())
      .map(async entry =>
        JSON.parse(
          await fs.readFile(
            path.join(packagesDirectory, entry.name, 'package.json'),
            'utf8',
          ),
        ),
      ),
  );

  return selectSnapshotPackages(packageJsons, shortSha);
}

/**
 * @param {string} name
 * @param {NodeJS.ProcessEnv} env
 */
function requireEnvironmentVariable(name, env) {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

/**
 * @param {{ env?: NodeJS.ProcessEnv; dryRun?: boolean }} [options]
 */
export async function main({
  env = process.env,
  dryRun = process.argv.includes('--dry-run'),
} = {}) {
  const githubToken = requireEnvironmentVariable('GITHUB_TOKEN', env);
  const githubRepository = requireEnvironmentVariable('GITHUB_REPOSITORY', env);
  const githubSha = requireEnvironmentVariable('GITHUB_SHA', env);
  const githubRefName = requireEnvironmentVariable('GITHUB_REF_NAME', env);
  const githubRunId = requireEnvironmentVariable('GITHUB_RUN_ID', env);
  const shortSha = requireEnvironmentVariable('SHORT_SHA', env);
  const githubServerUrl = env.GITHUB_SERVER_URL || 'https://github.com';
  const [owner, repo] = githubRepository.split('/');

  if (!owner || !repo) {
    throw new Error(
      `GITHUB_REPOSITORY must use the owner/repository format; received ${githubRepository}`,
    );
  }

  const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const publishedPackages = await findSnapshotPackages(
    path.join(repositoryRoot, 'packages'),
    shortSha,
  );

  if (publishedPackages.length === 0) {
    console.log('No snapshot packages found. Exiting.');
    return;
  }

  console.log(`Found ${publishedPackages.length} snapshot package(s):`);
  for (const pkg of publishedPackages) {
    console.log(`  - ${pkg.name}@${pkg.version}`);
  }

  const octokit = new Octokit({ auth: githubToken });
  const { data: associatedPullRequests } =
    await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: githubSha,
      per_page: 100,
    });
  const pullRequest = selectPullRequest(
    associatedPullRequests,
    githubRefName,
    githubRepository,
  );

  if (pullRequest == null) {
    console.log(
      `No open pull request found for ${githubRefName} at ${githubSha}. Exiting.`,
    );
    return;
  }

  const runUrl = `${githubServerUrl}/${githubRepository}/actions/runs/${githubRunId}`;
  const body = createSnapshotComment(publishedPackages, runUrl);

  if (dryRun) {
    console.log(`[dry-run] Would comment on #${pullRequest.number}:\n${body}`);
    return;
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: pullRequest.number,
    body,
  });
  console.log(`Commented on #${pullRequest.number}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
