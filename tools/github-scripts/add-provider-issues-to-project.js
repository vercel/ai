import { Octokit } from 'octokit';
import { createOAuthDeviceAuth } from '@octokit/auth-oauth-device';
import GitHubProject from "github-project";

const octokit = new Octokit({
  authStrategy: createOAuthDeviceAuth,
  auth: {
    clientType: 'github-app',
    clientId: 'Iv23liQZFJS7Hsc0KrZl',
    onVerification(verification) {
      console.log('Open %s', verification.verification_uri);
      console.log('Enter code: %s', verification.user_code);
    },
  },
});

const project = new GitHubProject({
    octokit,
    owner: 'vercel',
    number: 184,
    fields: {
        createdAt: 'Created At'
    }
});

const iterator = octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
  owner: 'vercel',
  repo: 'ai',
  state: 'open',
  labels: 'ai/provider',
  per_page: 100,
});

const stats = {}

for await (const response of iterator) {
  for (const issue of response.data) {
    if (issue.pull_request) continue;

    // // TODO: is currently failing due to "Resource not accessible by integration"
    // await project.items.add(issue.node_id, {
    //     createdAt: issue.created_at
    // });

    const providerLabels = issue.labels.filter(label => label.name.startsWith('provider/'));
    for (const label of providerLabels) {
        const provider = label.name.replace('provider/', '');
        if (!stats[provider]) {
            stats[provider] = 0;
        }
        stats[provider]++;
    }
  }
}

const sortedStats = Object.entries(stats).sort((a, b) => b[1] - a[1]).map(([provider, issues]) => ({ provider, issues }));

console.table(sortedStats);
