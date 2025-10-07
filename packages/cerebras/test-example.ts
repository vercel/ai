import { cerebras } from './src/index';
import { generateText, streamText } from 'ai';

// Test function to demonstrate using different Cerebras models
async function testCerebrasModels() {
  console.log('Testing Cerebras Provider with New Models\n');

  // Test with llama-3.3-70b
  console.log('1. Testing llama-3.3-70b model:');
  try {
    const result1 = await generateText({
      model: cerebras('llama-3.3-70b'),
      prompt: 'What is the capital of France? Answer in one word.',
      maxTokens: 10,
    });
    console.log('Response:', result1.text);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test with llama3.1-8b
  console.log('\n2. Testing llama3.1-8b model:');
  try {
    const result2 = await generateText({
      model: cerebras('llama3.1-8b'),
      prompt: 'Write a simple JavaScript function that adds two numbers.',
      maxTokens: 100,
    });
    console.log('Response:', result2.text);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test with gpt-oss-120b
  console.log('\n3. Testing gpt-oss-120b model:');
  try {
    const result3 = await generateText({
      model: cerebras('gpt-oss-120b'),
      prompt: 'Explain quantum computing in simple terms.',
      maxTokens: 150,
    });
    console.log('Response:', result3.text);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test with qwen-3-32b
  console.log('\n4. Testing qwen-3-32b model:');
  try {
    const result4 = await generateText({
      model: cerebras('qwen-3-32b'),
      prompt: 'What are the benefits of renewable energy?',
      maxTokens: 100,
    });
    console.log('Response:', result4.text);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test with qwen-3-coder-480b for code generation
  console.log('\n5. Testing qwen-3-coder-480b model for code generation:');
  try {
    const result5 = await generateText({
      model: cerebras('qwen-3-coder-480b'),
      prompt: 'Write a Python function to check if a number is prime.',
      maxTokens: 200,
    });
    console.log('Response:', result5.text);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test streaming with qwen-3-235b-a22b-thinking-2507
  console.log('\n6. Testing streaming with qwen-3-235b-a22b-thinking-2507 model:');
  try {
    const stream = await streamText({
      model: cerebras('qwen-3-235b-a22b-thinking-2507'),
      prompt: 'Think step by step: How would you solve a complex puzzle?',
      maxTokens: 200,
    });

    console.log('Streaming response:');
    for await (const chunk of stream.textStream) {
      process.stdout.write(chunk);
    }
    console.log('\n');
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test with qwen-3-235b-a22b-instruct-2507
  console.log('\n7. Testing qwen-3-235b-a22b-instruct-2507 model:');
  try {
    const result7 = await generateText({
      model: cerebras('qwen-3-235b-a22b-instruct-2507'),
      prompt: 'Provide step-by-step instructions for making coffee.',
      maxTokens: 150,
    });
    console.log('Response:', result7.text);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Test custom provider configuration
async function testCustomConfiguration() {
  console.log('\n\nTesting Custom Provider Configuration\n');

  // Test with custom baseURL and headers
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
    console.log('Custom configuration response:', result.text);
  } catch (error) {
    console.error('Error with custom configuration:', error.message);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting Cerebras Provider Tests\n');
  console.log('Note: Make sure to set CEREBRAS_API_KEY environment variable\n');
  
  await testCerebrasModels();
  await testCustomConfiguration();
  
  console.log('\n✅ All tests completed!');
}

// Export for use in other files
export { testCerebrasModels, testCustomConfiguration, runAllTests };

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}
