// @ts-nocheck
import { generateText } from 'ai';

export async function basicGenerateTextWithImage() {
  const result = await generateText({
    model: 'some-model',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'What do you see?' },
        {
          type: 'file',
          image: new Uint8Array([0, 1, 2, 3]),
          mimeType: 'image/png'
        }
      ]
    }]
  });
  
  return result;
}

export async function multipleImagesInMessage() {
  const result = await generateText({
    model: 'some-model',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Compare these images' },
        {
          type: 'file',
          image: new Uint8Array([0, 1, 2, 3]),
          mimeType: 'image/png'
        },
        {
          type: 'file',
          image: new Uint8Array([4, 5, 6, 7]),
          mimeType: 'image/jpeg'
        }
      ]
    }]
  });
  
  return result;
}

export async function multipleMessagesWithImages() {
  const result = await generateText({
    model: 'some-model',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'First image:' },
          {
            type: 'file',
            image: new Uint8Array([0, 1, 2, 3]),
            mimeType: 'image/png'
          }
        ]
      },
      {
        role: 'assistant',
        content: 'I can see the first image.'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Now this image:' },
          {
            type: 'file',
            image: new Uint8Array([8, 9, 10, 11]),
            mimeType: 'image/webp'
          }
        ]
      }
    ]
  });
  
  return result;
}

export async function imageWithDifferentProperties() {
  const imageData = new Uint8Array([0, 1, 2, 3]);
  
  const result = await generateText({
    model: 'some-model',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Analyze this' },
        {
          type: 'file',
          image: imageData,
          mimeType: 'image/png',
          experimental_providerMetadata: {
            anthropic: { cacheControl: { type: 'ephemeral' } }
          }
        }
      ]
    }]
  });
  
  return result;
}

export async function textOnlyMessage() {
  const result = await generateText({
    model: 'some-model',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Just text, no images' }
      ]
    }]
  });
  
  return result;
}

export function otherImageUsage() {
  // This should NOT be transformed - different context
  const config = {
    type: 'image',
    format: 'png'
  };
  
  return config;
}
