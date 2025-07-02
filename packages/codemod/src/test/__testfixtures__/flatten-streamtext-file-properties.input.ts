// @ts-nocheck
import { streamText } from 'ai';

export async function basicStreamTextWithFile() {
  const result = await streamText({
    model: 'some-model',
    prompt: 'Generate an image'
  });

  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'file': {
        // File data was nested under a 'file' property
        console.log('Media type:', delta.file.mediaType);
        console.log('File data:', delta.file.data);
        break;
      }
    }
  }
}

export async function streamTextWithMultipleFileAccess() {
  const result = await streamText({
    model: 'some-model',
    prompt: 'Create content'
  });

  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'file': {
        const mediaType = delta.file.mediaType;
        const fileData = delta.file.data;
        
        if (mediaType === 'image/png') {
          console.log('PNG file received:', fileData);
        }
        break;
      }
      case 'text': {
        console.log(delta.text);
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
    if (delta.type === 'file') {
      const isImage = delta.file.mediaType.startsWith('image/');
      const dataLength = delta.file.data.length;
      
      if (isImage && dataLength > 0) {
        console.log('Image received');
      }
    }
  }
}

export async function streamTextWithObjectSpread() {
  const result = await streamText({
    model: 'some-model',
    prompt: 'Create files'
  });

  const files = [];
  for await (const delta of result.fullStream) {
    if (delta.type === 'file') {
      files.push({
        type: delta.file.mediaType,
        content: delta.file.data,
        timestamp: Date.now()
      });
    }
  }
  
  return files;
}

export async function streamTextWithMethodChaining() {
  const result = await streamText({
    model: 'some-model',
    prompt: 'Generate content'
  });

  for await (const delta of result.fullStream) {
    if (delta.type === 'file') {
      const extension = delta.file.mediaType.split('/')[1];
      const base64Data = delta.file.data.toString('base64');
      
      console.log(`File: ${extension}, Size: ${base64Data.length}`);
    }
  }
}

export function otherFileUsage() {
  // This should NOT be transformed - different context
  const someFile = {
    file: {
      mediaType: 'text/plain',
      data: 'some content'
    }
  };
  
  return someFile.file.mediaType;
}

export function nonDeltaFileAccess() {
  // This should NOT be transformed - not a delta object
  const result = {
    file: {
      mediaType: 'application/json',
      data: '{}'
    }
  };
  
  return result.file.data;
} 