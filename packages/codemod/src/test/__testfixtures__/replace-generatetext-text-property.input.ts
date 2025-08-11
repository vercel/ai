// @ts-nocheck
import { generateText } from '@ai-sdk/provider';

export async function basicGenerateText() {
  const result = await generateText({
    model: 'some-model',
    prompt: 'Hello world'
  });

  // Text was a simple string
  console.log(result.text); // "Hello, world!"
  return result.text;
}

export async function generateTextWithAssignment() {
  const result = await generateText({
    model: 'some-model',
    prompt: 'Write a story'
  });

  const message = result.text;
  const upperText = result.text.toUpperCase();
  
  return { message, upperText };
}

export async function generateTextWithDestructuring() {
  const result = await generateText({
    model: 'some-model',
    prompt: 'Generate response'
  });

  const { text } = result;
  // TODO: `text` should be transformed to `text.text`
  return text;
}

export async function generateTextInCondition() {
  const result = await generateText({
    model: 'some-model',
    prompt: 'Check this'
  });

  if (result.text.length > 0) {
    return result.text;
  }
  
  return '';
}

export async function generateTextInObject() {
  const result = await generateText({
    model: 'some-model',
    prompt: 'Create content'
  });

  return {
    content: result.text,
    length: result.text.length,
    isEmpty: !result.text
  };
}

export async function multipleGenerateText() {
  const result1 = await generateText({
    model: 'some-model',
    prompt: 'First prompt'
  });

  const result2 = await generateText({
    model: 'some-model',
    prompt: 'Second prompt'
  });

  return result1.text + ' ' + result2.text;
}

export async function generateTextWithChaining() {
  const result = await generateText({
    model: 'some-model',
    prompt: 'Chain this'
  });

  return result.text.trim().toLowerCase();
}

export async function generateTextWithRandomName() {
  const random = await generateText({
    model: 'some-model',
    prompt: 'Chain this'
  });

  return random.text.trim().toLowerCase();
}

export function otherTextAccess() {
  const someObject = { text: 'regular text' };
  return someObject.text;
}

export async function ignoredFunctionResultText() {
    const response = {text: 'hi'};
    console.log(response.text);

    const result = await fetch('https://vercel.com');
    await result.text()
}