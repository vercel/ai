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

for (const provider of PROVIDERS) {
  const label = `provider/${provider}`;
  try {
    await octokit.rest.issues.createLabel({
      owner: 'vercel',
      repo: 'ai',
      name: label,
      color: 'bfd4f2',
      description: `Issues related to the @ai-sdk/${provider} provider`,
    });
    console.log(`Created label for ${label}`);
  } catch (error) {
    if (error.status === 422) {
      console.log(`Label for ${label} already exists`);
    } else {
      console.error(`Error creating label for ${label}:`, error);
      process.exit(1);
    }
  }
}
