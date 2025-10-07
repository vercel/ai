// Example usage of Cerebras Provider with AI SDK
// Save this as a separate file and run with: CEREBRAS_API_KEY=your_key node example-usage.js

// Note: This example requires the AI SDK to be installed
// npm install ai

import { cerebras } from '@ai-sdk/cerebras';
import { generateText, streamText } from 'ai';

// Test different models with appropriate prompts
async function testModels() {
  console.log('🚀 Testing Cerebras Models with AI SDK\n');

  // Test 1: General purpose with llama-3.3-70b
  console.log('1. Testing llama-3.3-70b (General Purpose):');
  const result1 = await generateText({
    model: cerebras('llama-3.3-70b'),
    prompt: 'What is artificial intelligence? Explain in one sentence.',
    maxTokens: 50,
  });
  console.log('Response:', result1.text.trim());
  console.log('─'.repeat(50));

  // Test 2: Code generation with qwen-3-coder-480b
  console.log('\n2. Testing qwen-3-coder-480b (Code Generation):');
  const result2 = await generateText({
    model: cerebras('qwen-3-coder-480b'),
    prompt: 'Write a Python function to check if a number is prime.',
    maxTokens: 150,
  });
  console.log('Response:', result2.text.trim());
  console.log('─'.repeat(50));

  // Test 3: Instruction following with qwen-3-235b-a22b-instruct-2507
  console.log('\n3. Testing qwen-3-235b-a22b-instruct-2507 (Instruction-tuned):');
  const result3 = await generateText({
    model: cerebras('qwen-3-235b-a22b-instruct-2507'),
    prompt: 'Follow these instructions exactly: 1) Say hello, 2) Count to 3, 3) Say goodbye',
    maxTokens: 100,
  });
  console.log('Response:', result3.text.trim());
  console.log('─'.repeat(50));

  // Test 4: Streaming with thinking model
  console.log('\n4. Testing qwen-3-235b-a22b-thinking-2507 (Streaming):');
  const stream = await streamText({
    model: cerebras('qwen-3-235b-a22b-thinking-2507'),
    prompt: 'Think step by step: How would you solve a complex puzzle?',
    maxTokens: 200,
  });

  console.log('Streaming response:');
  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }
  console.log('\n' + '─'.repeat(50));

  // Test 5: Multilingual with qwen-3-32b
  console.log('\n5. Testing qwen-3-32b (Multilingual):');
  const result5 = await generateText({
    model: cerebras('qwen-3-32b'),
    prompt: 'Translate "Hello, world!" to Spanish, French, and Japanese.',
    maxTokens: 100,
  });
  console.log('Response:', result5.text.trim());
  console.log('─'.repeat(50));

  // Test 6: High performance with gpt-oss-120b
  console.log('\n6. Testing gpt-oss-120b (High Performance):');
  const result6 = await generateText({
    model: cerebras('gpt-oss-120b'),
    prompt: 'List the key benefits of using renewable energy sources.',
    maxTokens: 150,
  });
  console.log('Response:', result6.text.trim());
  console.log('─'.repeat(50));

  // Test 7: Lightweight with llama3.1-8b
  console.log('\n7. Testing llama3.1-8b (Lightweight):');
  const result7 = await generateText({
    model: cerebras('llama3.1-8b'),
    prompt: 'What is 2 + 2? Give a simple answer.',
    maxTokens: 50,
  });
  console.log('Response:', result7.text.trim());
  console.log('─'.repeat(50));

  console.log('\n✅ All models tested successfully!');
}

// Custom provider configuration example
async function testCustomProvider() {
  console.log('\n\n⚙️ Testing Custom Provider Configuration:');
  
  const customProvider = cerebras({
    baseURL: 'https://api.cerebras.ai/v1',
    headers: {
      'X-Custom-Header': 'test-value',
    },
  });

  const result = await generateText({
    model: customProvider('llama-3.3-70b'),
    prompt: 'What is the capital of France?',
    maxTokens: 10,
  });
  
  console.log('Custom provider response:', result.text.trim());
}

// Run all tests
async function runAllTests() {
  if (!process.env.CEREBRAS_API_KEY) {
    console.error('❌ Please set CEREBRAS_API_KEY environment variable');
    process.exit(1);
  }

  try {
    await testModels();
    await testCustomProvider();
    console.log('\n🎉 All tests completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the tests
runAllTests();
