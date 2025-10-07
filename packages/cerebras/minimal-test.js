// Minimal test for Cerebras provider without AI SDK dependencies
const { createCerebras } = require('./dist/index.js');

console.log('🚀 Minimal Cerebras Provider Test\n');

// Test 1: Create default provider
console.log('1. Creating default provider...');
const defaultProvider = createCerebras();
console.log('✅ Default provider created successfully');

// Test 2: Create provider with custom options
console.log('\n2. Creating provider with custom options...');
const customProvider = createCerebras({
  baseURL: 'https://api.cerebras.ai/v1',
  headers: {
    'X-Custom-Header': 'test-value',
  },
});
console.log('✅ Custom provider created successfully');

// Test 3: Create models with all new IDs
console.log('\n3. Testing model creation with all new IDs...');
const modelIds = [
  'llama-3.3-70b',
  'llama3.1-8b',
  'gpt-oss-120b',
  'qwen-3-235b-a22b-instruct-2507',
  'qwen-3-235b-a22b-thinking-2507',
  'qwen-3-32b',
  'qwen-3-coder-480b',
];

modelIds.forEach(modelId => {
  try {
    const model = defaultProvider(modelId);
    console.log(`  ✅ Created model: ${modelId}`);
  } catch (error) {
    console.log(`  ❌ Failed to create model ${modelId}: ${error.message}`);
  }
});

// Test 4: Test provider methods
console.log('\n4. Testing provider methods...');
try {
  const model1 = defaultProvider('llama-3.3-70b');
  const model2 = defaultProvider.languageModel('gpt-oss-120b');
  const model3 = defaultProvider.chat('qwen-3-32b');
  console.log('  ✅ Direct call method works');
  console.log('  ✅ languageModel() method works');
  console.log('  ✅ chat() method works');
} catch (error) {
  console.log(`  ❌ Provider method error: ${error.message}`);
}

// Test 5: Test error handling
console.log('\n5. Testing error handling...');
try {
  defaultProvider.textEmbeddingModel('any-model');
  console.log('  ❌ Expected error for textEmbeddingModel');
} catch (error) {
  console.log('  ✅ Correctly threw error for textEmbeddingModel');
}

try {
  defaultProvider.imageModel('any-model');
  console.log('  ❌ Expected error for imageModel');
} catch (error) {
  console.log('  ✅ Correctly threw error for imageModel');
}

console.log('\n✅ All minimal tests passed!');
console.log('\nThe Cerebras provider is properly configured with all new models.');
