// @ts-nocheck
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

// Basic example from breaking change doc
export async function testBasicOnCompletion() {
  const result = streamText({
    model: openai('gpt-4-turbo'),
    prompt: 'What is the weather in San Francisco?',
  });

  return result.toAIStream({
    onFinal() {
      // ...
    },
  });
}

// With other properties
export async function testWithOtherProperties() {
  const result = streamText({
    model: openai('gpt-4-turbo'),
    prompt: 'Tell me a story',
  });

  return result.toAIStream({
    onStart() {
      console.log('Starting...');
    },
    onFinal() {
      console.log('Completed!');
    },
    onError(error) {
      console.error(error);
    },
  });
}

// Arrow function syntax
export async function testArrowFunction() {
  const result = streamText({
    model: openai('gpt-4-turbo'),
    prompt: 'Generate code',
  });

  return result.toAIStream({
    onFinal: () => {
      console.log('Done!');
    },
  });
}

// With parameters
export async function testWithParameters() {
  const result = streamText({
    model: openai('gpt-4-turbo'),
    prompt: 'Analyze data',
  });

  return result.toAIStream({
    onFinal(completion) {
      console.log('Completed with:', completion);
    },
  });
}

// Multiple toAIStream calls
export async function testMultipleCalls() {
  const result1 = streamText({
    model: openai('gpt-4-turbo'),
    prompt: 'First prompt',
  });

  const result2 = streamText({
    model: openai('gpt-4-turbo'),
    prompt: 'Second prompt',
  });

  const stream1 = result1.toAIStream({
    onFinal() {
      console.log('First completed');
    },
  });

  const stream2 = result2.toAIStream({
    onFinal() {
      console.log('Second completed');
    },
  });

  return [stream1, stream2];
}
