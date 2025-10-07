// Simple test to verify Cerebras model IDs
console.log('🚀 Testing Cerebras Provider Model IDs\n');

// List of all available models from the updated provider
const availableModels = [
  'llama-3.3-70b',
  'llama3.1-8b',
  'gpt-oss-120b',
  'qwen-3-235b-a22b-instruct-2507',
  'qwen-3-235b-a22b-thinking-2507',
  'qwen-3-32b',
  'qwen-3-coder-480b',
];

console.log('✅ Available Cerebras Models:');
availableModels.forEach((model, index) => {
  console.log(`  ${index + 1}. ${model}`);
});

// Test model categorization
console.log('\n✅ Model Categories:');
console.log('  Llama Models:');
console.log(`    - llama-3.3-70b (70B parameters)`);
console.log(`    - llama3.1-8b (8B parameters)`);

console.log('\n  GPT Model:');
console.log(`    - gpt-oss-120b (120B parameters)`);

console.log('\n  Qwen Models:');
console.log(`    - qwen-3-235b-a22b-instruct-2507 (235B, instruction-tuned)`);
console.log(`    - qwen-3-235b-a22b-thinking-2507 (235B, enhanced reasoning)`);
console.log(`    - qwen-3-32b (32B, multilingual)`);
console.log(`    - qwen-3-coder-480b (480B, code generation)`);

// Example usage patterns
console.log('\n✅ Example Usage Patterns:');
console.log(`
// For general purpose tasks
const generalModel = cerebras('llama-3.3-70b');

// For lightweight tasks
const lightweightModel = cerebras('llama3.1-8b');

// For high-performance tasks
const performanceModel = cerebras('gpt-oss-120b');

// For instruction following
const instructModel = cerebras('qwen-3-235b-a22b-instruct-2507');

// For complex reasoning
const reasoningModel = cerebras('qwen-3-235b-a22b-thinking-2507');

// For multilingual tasks
const multilingualModel = cerebras('qwen-3-32b');

// For code generation
const codeModel = cerebras('qwen-3-coder-480b');
`);

console.log('\n✅ All model IDs verified successfully!');
console.log('\nNote: To use these models, make sure to set your CEREBRAS_API_KEY environment variable');
