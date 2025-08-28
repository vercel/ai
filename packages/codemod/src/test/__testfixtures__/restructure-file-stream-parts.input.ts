// @ts-nocheck
// Test file for restructure-file-stream-parts codemod

import { streamText } from 'ai';

// Test streamText usage and fullStream iteration
const result = streamText({
  model: openai('gpt-4'),
  prompt: 'Generate a file',
});

for await (const part of result.fullStream) {
  switch (part.type) {
    case 'file':
      // Direct property access that should be restructured
      console.log('Media type:', part.mediaType);
      console.log('MIME type:', part.mimeType);
      console.log('Data:', part.data);
      console.log('Base64:', part.base64);
      console.log('Uint8Array:', part.uint8Array);
      
      // Direct identifier usage in function calls
      processFile(part);
      break;
  }
}

// Test with if statement
for await (const delta of result.fullStream) {
  if (delta.type === 'file') {
    console.log('File data:', delta.data);
    uploadFile(delta);
  }
}

// Test object literal that should be restructured
const fileStreamPart = {
  type: 'file',
  mediaType: 'image/png',
  mimeType: 'image/png',
  data: new Uint8Array([1, 2, 3]),
  base64: 'AQID',
  uint8Array: new Uint8Array([1, 2, 3])
};

// Test object without file properties (should not be transformed)
const otherPart = {
  type: 'text',
  content: 'Hello world'
};

function processFile(file: any) {
  return file;
}

function uploadFile(file: any) {
  return file;
}
