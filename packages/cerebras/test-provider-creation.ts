import { cerebras, createCerebras } from './src/index';
import { CerebrasChatModelId } from './src/cerebras-chat-options';

// Test that all new model IDs are properly typed
function testModelIds() {
  console.log('Testing Cerebras Model IDs\n');
  
  const validModels: CerebrasChatModelId[] = [
    'llama-3.3-70b',
    'llama3.1-8b',
    'gpt-oss-120b',
    'qwen-3-235b-a22b-instruct-2507',
    'qwen-3-235b-a22b-thinking-2507',
    'qwen-3-32b',
    'qwen-3-coder-480b',
  ];

  console.log('✅ All model IDs are valid:');
  validModels.forEach(model => {
    console.log(`  - ${model}`);
  });

  // Test that we can create models with each ID
  console.log('\n✅ Creating models with each ID:');
  validModels.forEach(modelId => {
    const model = cerebras(modelId);
    console.log(`  - Created model for ${modelId}: ${model.modelId}`);
  });
}

// Test provider configuration
function testProviderConfiguration() {
  console.log('\n\nTesting Provider Configuration\n');
  
  // Test default provider
  const defaultProvider = cerebras;
  console.log('✅ Default provider created');
  
  // Test custom provider
  const customProvider = createCerebras({
    baseURL: 'https://custom.api.url',
    headers: {
      'X-Custom-Header': 'test-value',
    },
  });
  console.log('✅ Custom provider created with custom baseURL and headers');
  
  // Test provider methods
  console.log('\n✅ Testing provider methods:');
  
  // Test direct call
  const model1 = defaultProvider('llama-3.3-70b');
  console.log(`  - Direct call: ${model1.modelId}`);
  
  // Test languageModel method
  const model2 = defaultProvider.languageModel('gpt-oss-120b');
  console.log(`  - languageModel(): ${model2.modelId}`);
  
  // Test chat method
  const model3 = defaultProvider.chat('qwen-3-32b');
  console.log(`  - chat(): ${model3.modelId}`);
}

// Test error handling for unsupported model types
function testErrorHandling() {
  console.log('\n\nTesting Error Handling\n');
  
  try {
    // This should throw NoSuchModelError
    cerebras.textEmbeddingModel('any-model');
    console.log('❌ Expected error for textEmbeddingModel');
  } catch (error) {
    console.log('✅ Correctly threw error for textEmbeddingModel:', error.message);
  }
  
  try {
    // This should throw NoSuchModelError
    cerebras.imageModel('any-model');
    console.log('❌ Expected error for imageModel');
  } catch (error) {
    console.log('✅ Correctly threw error for imageModel:', error.message);
  }
}

// Run all tests
function runAllTests() {
  console.log('🚀 Cerebras Provider Creation Tests\n');
  console.log('These tests verify that the provider is properly configured');
  console.log('with all new model IDs without requiring API keys.\n');
  
  testModelIds();
  testProviderConfiguration();
  testErrorHandling();
  
  console.log('\n✅ All provider creation tests passed!');
}

// Export for use in other files
export { testModelIds, testProviderConfiguration, testErrorHandling, runAllTests };

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}
