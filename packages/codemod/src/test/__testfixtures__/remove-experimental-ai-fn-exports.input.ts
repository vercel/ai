// @ts-nocheck
import { experimental_generateText, experimental_streamText, experimental_generateObject, experimental_streamObject } from 'ai';

async function main() {
  const result = await experimental_generateText({
    model: provider('model-name'),
    prompt: 'Hello',
  });

  const stream = await experimental_streamText({
    model: provider('model-name'),
    prompt: 'Hello',
  });

  const obj = await experimental_generateObject({
    model: provider('model-name'),
    prompt: 'Hello',
  });

  const objStream = await experimental_streamObject({
    model: provider('model-name'),
    prompt: 'Hello',
  });
}