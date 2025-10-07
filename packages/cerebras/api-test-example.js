// Comprehensive test file for Cerebras Provider with API calls
// Usage: CEREBRAS_API_KEY=your_api_key node api-test-example.js

const { cerebras } = require('./dist/index.js');
const { generateText, streamText } = require('ai');

// Test configuration
const TEST_CONFIG = {
  maxTokens: 100,
  temperature: 0.7,
};

// Model test cases with appropriate prompts
const MODEL_TESTS = [
  {
    modelId: 'llama-3.3-70b',
    description: 'General purpose 70B model',
    prompt: 'What is artificial intelligence? Explain in one sentence.',
  },
  {
    modelId: 'llama3.1-8b',
    description: 'Lightweight 8B model',
    prompt: 'Write a hello world function in JavaScript.',
  },
  {
    modelId: 'gpt-oss-120b',
    description: 'High-performance 120B model',
    prompt: 'List three benefits of cloud computing.',
  },
  {
    modelId: 'qwen-3-235b-a22b-instruct-2507',
    description: 'Instruction-tuned 235B model',
    prompt: 'Follow these instructions: 1) Count to 3, 2) Say the alphabet backwards',
  },
  {
    modelId: 'qwen-3-235b-a22b-thinking-2507',
    description: 'Enhanced reasoning 235B model',
    prompt: 'Think step by step: If a train travels 60km in 1 hour, how far will it travel in 2.5 hours?',
  },
  {
    modelId: 'qwen-3-32b',
    description: 'Multilingual 32B model',
    prompt: 'Translate "Hello, how are you?" to Spanish and French.',
  },
  {
    modelId: 'qwen-3-coder-480b',
    description: 'Code generation 480B model',
    prompt: 'Write a Python function that calculates the factorial of a number.',
  },
];

// Test streaming with a thinking model
async function testStreaming() {
  console.log('\n🌊 Testing Streaming with qwen-3-235b-a22b-thinking-2507\n');
  
  try {
    const stream = await streamText({
      model: cerebras('qwen-3-235b-a22b-thinking-2507'),
      prompt: 'Think step by step and explain your reasoning: What is the sum of the first 10 prime numbers?',
      ...TEST_CONFIG,
    });

    console.log('Streaming response:');
    process.stdout.write('  ');
    for await (const chunk of stream.textStream) {
      process.stdout.write(chunk);
    }
    console.log('\n');
  } catch (error) {
    console.error('❌ Streaming test failed:', error.message);
  }
}

// Test each model individually
async function testModel(modelTest) {
  console.log(`\n🤖 Testing ${modelTest.modelId} - ${modelTest.description}\n`);
  
  try {
    const result = await generateText({
      model: cerebras(modelTest.modelId),
      prompt: modelTest.prompt,
      ...TEST_CONFIG,
    });
    
    console.log(`✅ Success! Response:`);
    console.log(`  ${result.text.trim()}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed: ${error.message}`);
    return false;
  }
}

// Test custom provider configuration
async function testCustomConfiguration() {
  console.log('\n⚙️ Testing Custom Provider Configuration\n');
  
  const customProvider = cerebras({
    baseURL: 'https://api.cerebras.ai/v1',
    headers: {
      'X-Custom-Header': 'test-value',
    },
  });

  try {
    const result = await generateText({
      model: customProvider('llama-3.3-70b'),
      prompt: 'What is 2 + 2?',
      maxTokens: 10,
    });
    
    console.log(`✅ Custom configuration works! Response: ${result.text.trim()}`);
    return true;
  } catch (error) {
    console.error(`❌ Custom configuration failed: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Cerebras Provider API Tests\n');
  console.log('Note: Make sure CEREBRAS_API_KEY environment variable is set\n');
  
  // Check for API key
  if (!process.env.CEREBRAS_API_KEY) {
    console.error('❌ CEREBRAS_API_KEY environment variable is not set!');
    console.log('Please run: CEREBRAS_API_KEY=your_key node api-test-example.js');
    process.exit(1);
  }

  let successCount = 0;
  let totalTests = MODEL_TESTS.length + 2; // +1 for streaming, +1 for custom config

  // Test each model
  for (const modelTest of MODEL_TESTS) {
    const success = await testModel(modelTest);
    if (success) successCount++;
  }

  // Test streaming
  console.log('\n' + '='.repeat(50));
  const streamSuccess = await testStreaming();
  if (streamSuccess) successCount++;

  // Test custom configuration
  console.log('\n' + '='.repeat(50));
  const customSuccess = await testCustomConfiguration();
  if (customSuccess) successCount++;

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Test Summary: ${successCount}/${totalTests} tests passed`);
  
  if (successCount === totalTests) {
    console.log('✅ All tests passed successfully!');
  } else {
    console.log(`⚠️ ${totalTests - successCount} test(s) failed`);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests, testModel, testStreaming, testCustomConfiguration };
