// @ts-nocheck
import { streamText } from 'ai';

export async function basicStreamText() {
  const result = await streamText({
    model: 'some-model',
    prompt: 'Hello world'
  });

  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'text': {
        process.stdout.write(delta.text);
        break;
      }
    }
  }
}

export async function streamTextWithMultipleHandling() {
  const result = await streamText({
    model: 'some-model',
    prompt: 'Write a story'
  });

  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'text': {
        const text = delta.text;
        console.log(text);
        break;
      }
      case 'error': {
        console.error(delta.error);
        break;
      }
    }
  }
}

export async function streamTextWithDirectUsage() {
  const result = await streamText({
    model: 'some-model',
    prompt: 'Generate response'
  });

  for await (const delta of result.fullStream) {
    if (delta.type === 'text') {
      const content = delta.text.trim();
      if (content.length > 0) {
        console.log(content);
      }
    }
  }
}

export async function streamTextWithAssignment() {
  const result = await streamText({
    model: 'some-model',
    prompt: 'Create content'
  });

  let fullText = '';
  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'text': {
        fullText += delta.text;
        break;
      }
    }
  }
  
  return fullText;
}

export function otherDeltaUsage() {
  const someOtherDelta = { textDelta: 'regular text' };
  return someOtherDelta.textDelta;
}

export function nonDeltaTextDelta() {
  const data = { textDelta: 'some value' };
  return data.textDelta;
} 