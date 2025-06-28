// @ts-nocheck
import { embed, embedMany, generateText, generateObject, streamText } from 'ai';

export async function testEmbed() {
  const { usage } = await embed({
    model: 'some-model',
    value: 'sunny day at the beach',
  });

  console.log(usage.promptTokens);
  console.log(usage.completionTokens);
}

export async function testEmbedMany() {
  const { usage } = await embedMany({
    model: 'some-model',
    values: [
      'sunny day at the beach',
      'rainy afternoon in the city',
      'snowy night in the mountains',
    ],
  });

  console.log(usage.promptTokens);
  console.log(usage.completionTokens);
}

// Test generateText usage pattern
export async function testGenerateText() {
  const result = await generateText({
    model: 'some-model',
    prompt: 'Write a story',
  });

  console.log(result.usage.promptTokens);
  console.log(result.usage.completionTokens);
  
  return {
    text: result.text,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  };
}

// Test generateObject usage pattern  
export async function testGenerateObject() {
  const { usage, object } = await generateObject({
    model: 'some-model',
    prompt: 'Generate a person object',
    schema: { type: 'object' },
  });

  const { promptTokens, completionTokens } = usage;
  return { object, promptTokens, completionTokens };
}

// Test streamText usage pattern
export async function testStreamText() {
  const stream = streamText({
    model: 'some-model',
    prompt: 'Write a story',
  });

  for await (const part of stream.textStream) {
    console.log(part);
  }

  const finishReason = await stream.finishReason;
  const usage = await stream.usage;
  
  console.log(`Used ${usage.promptTokens} prompt tokens`);
  console.log(`Used ${usage.completionTokens} completion tokens`);
}


