import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { createProviderRegistry } from 'ai';
import { generateText } from 'ai';

// Setup registry with multiple providers
const registry = createProviderRegistry({
  anthropic,
  openai,
});

async function exampleWithLatest() {
  // Using --latest suffix automatically resolves to claude-sonnet-4-5
  const result = await generateText({
    model: registry.languageModel('anthropic:claude-sonnet--latest'),
    prompt: 'What is the meaning of life?',
  });

  console.log(result.text);
}

async function exampleWithMultipleProviders() {
  // Test with different providers using --latest
  
  // Anthropic - resolves to claude-opus-4-1
  const anthropicResult = await generateText({
    model: registry.languageModel('anthropic:claude-opus--latest'),
    prompt: 'Write a haiku about coding',
  });

  // OpenAI - resolves to gpt-4.5
  const openaiResult = await generateText({
    model: registry.languageModel('openai:gpt--latest'),
    prompt: 'Write a haiku about AI',
  });

  console.log('Anthropic:', anthropicResult.text);
  console.log('OpenAI:', openaiResult.text);
}

async function exampleWithoutLatest() {
  // Traditional usage still works - specify exact version
  const result = await generateText({
    model: registry.languageModel('anthropic:claude-sonnet-4-5'),
    prompt: 'Hello!',
  });

  console.log(result.text);
}

// Run examples
exampleWithLatest();
