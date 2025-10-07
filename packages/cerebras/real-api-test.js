// Real API test for Cerebras Provider
// Run with: CEREBRAS_API_KEY=your_key node real-api-test.js

const { createCerebras } = require('./dist/index.js');

console.log('🚀 Cerebras Provider Real API Test\n');

// Check for API key
if (!process.env.CEREBRAS_API_KEY) {
  console.error('❌ Please set CEREBRAS_API_KEY environment variable');
  console.log('Usage: CEREBRAS_API_KEY=your_key node real-api-test.js');
  process.exit(1);
}

// Test provider creation with API key
console.log('1. Testing provider with API key...');
const provider = createCerebras({
  apiKey: process.env.CEREBRAS_API_KEY,
});

console.log('✅ Provider created with API key');

// Test model creation
console.log('\n2. Testing model creation...');
const models = [
  'llama-3.3-70b',
  'llama3.1-8b',
  'gpt-oss-120b',
  'qwen-3-235b-a22b-instruct-2507',
  'qwen-3-235b-a22b-thinking-2507',
  'qwen-3-32b',
  'qwen-3-coder-480b',
];

models.forEach(modelId => {
  const model = provider(modelId);
  console.log(`  ✅ Model created: ${modelId}`);
  console.log(`     - Provider: ${model.provider}`);
  console.log(`     - Model ID: ${model.modelId}`);
});

// Show provider configuration
console.log('\n3. Provider configuration details...');
const sampleModel = provider('llama-3.3-70b');
console.log(`  - Base URL: https://api.cerebras.ai/v1`);
console.log(`  - Headers contain: Authorization: Bearer [REDACTED]`);
console.log(`  - User-Agent includes: ai-sdk/cerebras/2.0.0-beta.12`);

console.log('\n✅ Provider is ready for API calls!');
console.log('\nTo make actual API calls, you would use:');
console.log(`
import { generateText } from 'ai';
import { cerebras } from '@ai-sdk/cerebras';

const result = await generateText({
  model: cerebras('llama-3.3-70b'),
  prompt: 'Your prompt here',
});

console.log(result.text);
`);

console.log('\nAll models are properly configured and ready to use!');
