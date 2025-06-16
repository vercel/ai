// @ts-nocheck
import { embed, embedMany, generateText, generateObject, streamText } from 'ai';

export async function testEmbed() {
  const { usage } = await embed({
    model: 'some-model',
    value: 'sunny day at the beach',
  });

  console.log(usage.inputTokens);
  console.log(usage.outputTokens);
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

  console.log(usage.inputTokens);
  console.log(usage.outputTokens);
}

// Test generateText usage pattern
export async function testGenerateText() {
  const result = await generateText({
    model: 'some-model',
    prompt: 'Write a story',
  });

  console.log(result.usage.inputTokens);
  console.log(result.usage.outputTokens);

  return {
    text: result.text,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  };
}

// Test generateObject usage pattern
export async function testGenerateObject() {
  const { usage, object } = await generateObject({
    model: 'some-model',
    prompt: 'Generate a person object',
    schema: { type: 'object' },
  });

  const { inputTokens, outputTokens } = usage;
  return { object, inputTokens, outputTokens };
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

  console.log(`Used ${usage.inputTokens} prompt tokens`);
  console.log(`Used ${usage.outputTokens} completion tokens`);
}
