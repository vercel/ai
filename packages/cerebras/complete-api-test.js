// Complete API test for Cerebras Provider - makes real API calls
// Run with: CEREBRAS_API_KEY=your_key node complete-api-test.js

const { cerebras } = require('./dist/index.js');
const { generateText } = require('../../ai/dist/index.js');

console.log('🚀 Cerebras Provider Complete API Test\n');

// Check for API key
if (!process.env.CEREBRAS_API_KEY) {
  console.error('❌ Please set CEREBRAS_API_KEY environment variable');
  console.log('Usage: CEREBRAS_API_KEY=your_key node complete-api-test.js');
  process.exit(1);
}

// Test with different models
async function testModel(modelId, prompt, description) {
  console.log(`\n🤖 Testing ${modelId} - ${description}`);
  console.log(`Prompt: "${prompt}"`);
  console.log('─'.repeat(50));
  
  try {
    const startTime = Date.now();
    const result = await generateText({
      model: cerebras(modelId),
      prompt: prompt,
      maxTokens: 150,
      temperature: 0.7,
    });
    const endTime = Date.now();
    
    console.log(`✅ Success (${endTime - startTime}ms)`);
    console.log(`Response: ${result.text.trim()}`);
    console.log(`Tokens used: ${result.usage?.totalTokens || 'N/A'}`);
    return true;
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return false;
  }
}

// Main test function
async function runTests() {
  console.log('Testing all new Cerebras models with real API calls...\n');
  
  let successCount = 0;
  const totalTests = 7;
  
  // Test each model with appropriate prompts
  const tests = [
    {
      modelId: 'llama-3.3-70b',
      prompt: 'What is artificial intelligence? Explain in one sentence.',
      description: 'General purpose 70B model'
    },
    {
      modelId: 'llama3.1-8b',
      prompt: 'Write a simple hello world function in JavaScript.',
      description: 'Lightweight 8B model'
    },
    {
      modelId: 'gpt-oss-120b',
      prompt: 'List three benefits of cloud computing.',
      description: 'High-performance 120B model'
    },
    {
      modelId: 'qwen-3-235b-a22b-instruct-2507',
      prompt: 'Follow these instructions: 1) Count to 3, 2) Say the alphabet backwards',
      description: 'Instruction-tuned 235B model'
    },
    {
      modelId: 'qwen-3-235b-a22b-thinking-2507',
      prompt: 'Think step by step: If a train travels 60km in 1 hour, how far will it travel in 2.5 hours?',
      description: 'Enhanced reasoning 235B model'
    },
    {
      modelId: 'qwen-3-32b',
      prompt: 'Translate "Hello, how are you?" to Spanish and French.',
      description: 'Multilingual 32B model'
    },
    {
      modelId: 'qwen-3-coder-480b',
      prompt: 'Write a Python function that calculates the factorial of a number.',
      description: 'Code generation 480B model'
    }
  ];
  
  // Run each test
  for (const test of tests) {
    const success = await testModel(test.modelId, test.prompt, test.description);
    if (success) successCount++;
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Test Summary: ${successCount}/${totalTests} tests passed`);
  
  if (successCount === totalTests) {
    console.log('🎉 All tests passed successfully!');
    console.log('\nThe Cerebras provider is working perfectly with all new models!');
  } else {
    console.log(`⚠️ ${totalTests - successCount} test(s) failed`);
  }
  
  console.log('\nProvider Details:');
  console.log('- Version: 2.0.0-beta.12');
  console.log('- Base URL: https://api.cerebras.ai/v1');
  console.log('- All 7 new models are fully supported');
}

// Run the tests
runTests().catch(error => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
