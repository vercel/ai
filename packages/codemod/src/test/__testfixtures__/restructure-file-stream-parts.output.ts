// @ts-nocheck

import { streamText } from "ai";
import { google } from "@ai-sdk/google";

const messages = [
  {
    role: "user",
    content: "What is the capital of France?",
  },
];

const result = streamText({
  model: google("gemini-2.0-flash-exp"),
  providerOptions: {
    google: { responseModalities: ["TEXT", "IMAGE"] },
  },
  messages,
});

for await (const delta of result.fullStream) {
  switch (delta.type) {
    case "file": {
      if (delta.file.mimeType.startsWith("image/")) {
        console.log(delta.file);
      }
    }
  }
}

// Edge case: Multiple streamText calls with different variable names
const chatResult = streamText({
  model: google("gemini-2.0-flash-exp"),
  messages,
});

for await (const chunk of chatResult.fullStream) {
  if (chunk.type === 'file') {
    console.log(chunk.file.mediaType);
    await processFile(chunk.file.data);
    const base64Content = chunk.file.base64;
  }
}

// Edge case: Object literal file stream parts (legacy patterns)
const legacyFileStreamPart = {
  type: 'file',

  file: {
    mediaType: 'text/plain',
    data: 'Hello World'
  }
};

// Edge case: Nested access in conditional
function handleFile(part: any) {
  if (part.type === 'file') {
    const isImage = part.file.mimeType.startsWith('image/');
    return part.file.uint8Array || part.file.base64;
  }
}

// Edge case: Array processing
const streamParts = [
  { type: 'text', text: 'Hello' },
  {
    type: 'file',

    file: {
      mediaType: 'application/pdf',
      data: 'binary data'
    }
  },
];

// Edge case: Function argument passing
function processFiles(items: any[]) {
  items.forEach(item => {
    if (item.type === 'file') {
      sendToProcessor([item.file]);
    }
  });
}
