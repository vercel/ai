import { Octokit } from 'octokit';
import { createOAuthDeviceAuth } from '@octokit/auth-oauth-device';

const PROVIDERS = [
  'amazon-bedrock',
  'anthropic',
  'assemblyai',
  'azure',
  'baseten',
  'cerebras',
  'cohere',
  'deepgram',
  'deepinfra',
  'deepseek',
  'elevenlabs',
  'fal',
  'fireworks',
  'gateway',
  'gladia',
  'google',
  'google-vertex',
  'groq',
  'huggingface',
  'hume',
  'lmnt',
  'luma',
  'mistral',
  'openai',
  'openai-compatible',
  'perplexity',
  'replicate',
  'revai',
  'togetherai',
  'vercel',
  'xai',
];

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

const issues = [];
for (const provider of PROVIDERS) {
  console.log(`\nFetching issues for provider: ${provider}`);
  const iterator = octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
    owner: 'vercel',
    repo: 'ai',
    state: 'all',
    labels: [`provider/${provider}`],
  });

  for await (const response of iterator) {
    for (const issue of response.data) {
      issues.push(issue);
      console.log(`Processing issue #${issue.html_url}`);
    }
  }
}
