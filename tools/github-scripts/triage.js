import { Octokit } from 'octokit';
import { createOAuthDeviceAuth } from '@octokit/auth-oauth-device';
import { generateObject, jsonSchema, createGateway } from 'ai';

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

const NON_PROVIDER_LABELS = [
  'ai/ui',
  'ai/gateway',
  'ai/mcp',
  'ai/rsc',
  'ai/telemetry',
  'ai/core',
  'provider/community',
  'expo',
]

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

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

const labels = PROVIDERS.map(p => `provider/${p}`);

const iterator = octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
  owner: 'vercel',
  repo: 'ai',
  state: 'all',
});

for await (const response of iterator) {
  for (const issue of response.data) {
    if (issue.pull_request) continue;

    console.log(`\nProcessing ${issue.html_url}\n`);

    const result = await generateObject({
      model: gateway('openai/gpt-4o'),
      system: `You are an expert software engineer working on classifying GitHub issues for the Vercel AI SDK repository. Your task is to analyze the content of each issue and determine which labels should be assigned.`,
      prompt: `First find out which category label the issue should be assigned. If the category label should be "ai/provider", then also determine which specific provider labels are relevant based on the issue content.

Available category labels:

- ai/ui
- ai/gateway
- ai/mcp
- ai/rsc
- ai/telemetry
- ai/provider

Available provider labels:

${labels.map(l => `- ${l}`).join('\n')}

Here are the rules to follow when assigning labels:

- If the issue is about a UI problem (Vue, Angular, React, AI Elements), return ai/ui and no other labels
- If the issue is about the AI gateway, return ai/gateway and no other labels
- If the issue is about MCP functionality, return ai/mcp and no other labels
- If the issue is about RSC functionality, return ai/rsc and no other labels
- If the issue is about telementry, return ai/telemetry and no other labels
- If the issue is about a core functionality of the AI SDK, such as generating text, images, audio, or embeddings, return ai/core and no other labels.
- If the issue is related to an AI provider, add "ai/provider" to the list of returned labels.
- If the issue is about adding a new provider, do not return any provider labels, only "ai/provider".
- Look for mentions of specific AI providers like OpenAI, Anthropic, Google, Azure, or their package names (e.g., @ai-sdk/openai, @ai-sdk/anthropic, @ai-sdk/google, @ai-sdk/azure, etc).
- If no known provider is mentioned, do not try to guess one.
- If the issue mentions community or third-party providers, use "provider/community". If the issue mentionse a provider but the package name does not begin with "@ai-sdk/", use "provider/community".
- If it's about OpenAI-compatible APIs, use "provider/openai-compatible", not "provider/openai"
- Only return "provider/vercel" if the issue is about v0.
- Multiple labels can be assigned if the issue involves multiple providers, but only if you are confident (>0.8) about their relevance.
- Distinguish between models and providers. Just because a model from e.g. openai or anthropic is mentioned doensn't mean the provider is the same. The same models can be hosted by different providers.
- Only assign labels if you're reasonably confident (>0.6) about the relevance
- If the issue mentiones React Native or Expo, add the "ai/ui" label and "expo" label

Here is the issue content:

Issue Title: ${issue.title}

Issue Body: ${issue.body}`,
      schema: jsonSchema({
        type: 'object',
        properties: {
          labels: {
            type: 'array',
            items: {
              type: 'string',
              enum: labels.concat(NON_PROVIDER_LABELS),
            },
            description:
              'Array of provider labels that are most relevant to this issue. Choose one or more labels that best match the AI provider mentioned in the issue.',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Confidence score for the label classification (0-1)',
          },
          reasoning: {
            type: 'string',
            description:
              'A brief explanation of why these labels were chosen based on the issue content.',
          },
        },
        required: ['labels', 'confidence'],
      }),
    });

    // add the labels
    if (result.object.confidence >= 0.6 && result.object.labels.length > 0) {
      console.log(
        `Adding labels ${result.object.labels.join(
          ', ',
        )} (confidence: ${result.object.confidence})`,
      );
      console.log(`Reasoning: ${result.object.reasoning}`);

      try {
        await octokit.rest.issues.addLabels({
          owner: 'vercel',
          repo: 'ai',
          issue_number: issue.number,
          labels: result.object.labels,
        });
      } catch (e) {
        console.error('Failed to add labels', e);
      }
    } else {
      console.log(
        `Skipping label addition due to low confidence (${result.object.confidence}) or no labels found.`,
      );
      console.log(`Reasoning: ${result.object.reasoning}`);
    }

    // console.log(`Adding labels:\n- ${result.object.labels.join('\n- ')}\n(confidence: ${result.object.confidence})`);
    // console.log(`\n${result.object.reasoning}\n\n`);
  }
}
