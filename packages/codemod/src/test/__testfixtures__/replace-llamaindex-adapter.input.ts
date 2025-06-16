// @ts-nocheck
import { LlamaIndexAdapter, generateText } from 'ai';

// Basic example from breaking change doc
export async function testBasicLlamaIndexAdapter() {
  const stream = createSomeStream();
  return LlamaIndexAdapter.toDataStreamResponse(stream);
}

// With other imports from 'ai' in same import statement
export async function testWithOtherImports() {
  const result = generateText({
    model: 'some-model',
    prompt: 'Hello world',
  });

  const stream = createSomeStream();
  return LlamaIndexAdapter.toDataStreamResponse(stream);
}

// Multiple calls
export async function testMultipleCalls() {
  const stream1 = createSomeStream();
  const stream2 = createSomeStream();

  const response1 = LlamaIndexAdapter.toDataStreamResponse(stream1);
  const response2 = LlamaIndexAdapter.toDataStreamResponse(stream2);

  return [response1, response2];
}

// In a more complex expression
export async function testComplexExpression() {
  return await LlamaIndexAdapter.toDataStreamResponse(createSomeStream());
}

function createSomeStream() {
  return {};
}
