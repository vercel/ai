import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isScopedProviderModel,
  providerImport,
  providerModelExpression,
} from '../lib/provider-code-config.ts';
import { renderGatewayCode, hasCodeTemplate } from '../lib/code-template.mjs';
import { resolveModelPlaceholders } from '../lib/geistdocs/model-placeholders.ts';

test('hosted-provider dropdowns include mapped models from other creators and reject unmapped models', () => {
  assert.equal(isScopedProviderModel('groq', { id: 'alibaba/qwen3.6-27b', provider: 'alibaba', kind: 'text' }), true);
  assert.equal(isScopedProviderModel('groq', { id: 'alibaba/qwen3.7-max', provider: 'alibaba', kind: 'text' }), false);
  assert.equal(isScopedProviderModel('groq', { id: 'alibaba/qwen3.6-27b', provider: 'alibaba', kind: 'video' }), false);
  assert.equal(isScopedProviderModel('openai', { id: 'anthropic/claude-sonnet-5.5', provider: 'anthropic', kind: 'text' }), false);
  assert.equal(isScopedProviderModel('openai', { id: 'openai/gpt-6-astra', provider: 'openai', kind: 'text' }), true);
});

test('direct examples use SDK exports and provider IDs rather than Gateway slugs', () => {
  assert.equal(providerImport('deepseek'), 'import { deepSeek } from "@ai-sdk/deepseek"');
  assert.equal(providerImport('amazon'), 'import { amazonBedrock } from "@ai-sdk/amazon-bedrock"');
  assert.equal(providerModelExpression('anthropic', 'anthropic/claude-sonnet-5.5', ''), 'anthropic("claude-sonnet-5-5")');
  assert.equal(providerModelExpression('groq', 'alibaba/qwen3.6-27b', ''), 'groq("qwen/qwen3.6-27b")');
  assert.equal(providerModelExpression('cohere', 'cohere/command-a', ''), 'cohere("command-a-03-2025")');
  assert.equal(providerModelExpression('perplexity', 'perplexity/sonar', ''), 'perplexity("perplexity/sonar")');
  assert.equal(providerModelExpression('replicate', 'bfl/flux-2-pro', '.image'), 'replicate.image("black-forest-labs/flux-2-pro")');
  assert.equal(providerModelExpression('bytedance', 'bytedance/seedream-5.0-pro', '.image'), 'byteDance.image("dola-seedream-5-0-pro-260628")');
  assert.equal(providerModelExpression('prodia', 'prodia/flux-fast-schnell', '.image'), 'prodia.image("inference.flux-fast.schnell.txt2img.v2")');
  assert.equal(providerModelExpression('typesafe-ai', 'typesafe-ai/jev', '.decisionModel'), 'typeSafeAi.decisionModel("jev-latest")');
});

test('Azure and custom endpoints require a configured deployment or loaded model', () => {
  assert.equal(providerModelExpression('azure', 'openai/gpt-6-astra', ''), 'azure("your-gpt-6-astra-deployment-name")');
  assert.equal(providerModelExpression('open-responses', 'openai/gpt-6-astra', ''), 'openResponses("your-model-id")');
  assert.match(providerImport('open-responses'), /createOpenResponses\(\{/);
  assert.match(providerImport('open-responses'), /url: process.env.OPEN_RESPONSES_URL!/);
});

test('scoped image, video, speech, embedding, and decision Markdown defaults match their snippets', () => {
  for (const [placeholder, modelId] of [
    ['__IMAGE_MODEL__', 'bfl/flux-2-pro'],
    ['__VIDEO_MODEL__', 'klingai/kling-v3.0-t2v'],
    ['__SPEECH_MODEL__', 'fish-audio/s2.1-pro'],
    ['__EMBEDDING_MODEL__', 'voyage/voyage-4'],
    ['__DECISION_MODEL__', 'typesafe-ai/jev'],
  ]) {
    const template = `__PROVIDER_IMPORT__;\nconst model = ${placeholder};`;
    assert.equal(hasCodeTemplate(template), true);
    assert.equal(renderGatewayCode(template, { defaultModelId: modelId }), `const model = "${modelId}";`);
  }
  assert.equal(resolveModelPlaceholders('__SPEECH_MODEL__ __TRANSCRIPTION_MODEL__ __EMBEDDING_MODEL__ __DECISION_MODEL__'), "'fish-audio/s2.1-pro' 'openai/whisper-1' 'voyage/voyage-4' 'typesafe-ai/jev'");
});

test('native-provider selectors exclude Gateway routing variants and models requiring different input', () => {
  assert.equal(isScopedProviderModel('openai', { id: 'openai/gpt-6-astra-fast', provider: 'openai', kind: 'text' }), false);
  assert.equal(isScopedProviderModel('openai', { id: 'openai/gpt-oss-120b', provider: 'openai', kind: 'text' }), false);
  assert.equal(isScopedProviderModel('anthropic', { id: 'anthropic/claude-sonnet-5.5-batch', provider: 'anthropic', kind: 'text' }), false);
  assert.equal(isScopedProviderModel('bfl', { id: 'bfl/flux-pro-1.0-fill', provider: 'bfl', kind: 'image' }), false);
  assert.equal(providerModelExpression('mistral', 'mistral/ministral-14b', ''), 'mistral("ministral-14b-latest")');
});
