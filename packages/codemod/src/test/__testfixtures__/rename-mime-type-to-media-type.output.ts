// @ts-nocheck
import { streamText, generateText, generateObject, streamObject } from 'ai';
import { openai } from '@ai-sdk/openai';

// Basic streamText example
const result1 = await streamText({
  model: openai('gpt-4-turbo'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Analyze the following PDF and generate a summary.',
        },
        {
          type: 'file',
          data: contents,
          mediaType: 'application/pdf',
        },
      ],
    },
  ],
});

// generateText with multiple file types
const result2 = await generateText({
  model: openai('gpt-4o'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'What do you see in these files?',
        },
        {
          type: 'file',
          data: imageBuffer,
          mediaType: 'image/jpeg',
        },
        {
          type: 'file',
          data: audioBuffer,
          mediaType: 'audio/wav',
        },
      ],
    },
  ],
});

// generateObject example
const result3 = await generateObject({
  model: openai('gpt-4o'),
  schema: z.object({
    summary: z.string(),
  }),
  messages: [
    {
      role: 'system',
      content: 'You are a helpful assistant.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Extract key information from this document.',
        },
        {
          type: 'file',
          data: docBuffer,
          mediaType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
      ],
    },
  ],
});

// streamObject example
const result4 = await streamObject({
  model: openai('gpt-4o'),
  schema: z.object({
    items: z.array(z.string()),
  }),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'List items from this spreadsheet.',
        },
        {
          type: 'file',
          data: xlsxBuffer,
          mediaType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    },
  ],
});

// String-quoted properties (should also be transformed)
const result5 = await streamText({
  model: openai('gpt-4-turbo'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          data: videoBuffer,
          mediaType: 'video/mp4',
        },
      ],
    },
  ],
});

// Multiple messages with files
const result6 = await generateText({
  model: openai('gpt-4o'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          data: file1,
          mediaType: 'text/plain',
        },
      ],
    },
    {
      role: 'assistant',
      content: 'I can see the text file. What would you like me to do with it?',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Compare it with this image.',
        },
        {
          type: 'file',
          data: file2,
          mediaType: 'image/png',
        },
      ],
    },
  ],
});

// Mixed content with text and non-file objects (shouldn't be affected)
const result7 = await streamText({
  model: openai('gpt-4-turbo'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Hello world',
        },
        {
          type: 'image',
          url: 'https://example.com/image.jpg',
          mimeType: 'image/jpeg', // This should NOT be transformed (not type: 'file')
        },
        {
          type: 'file',
          data: pdfBuffer,
          mediaType: 'application/pdf', // This SHOULD be transformed
        },
      ],
    },
  ],
});

// Edge case: non-AI function calls should not be affected
const nonAiResult = await someOtherFunction({
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          data: buffer,
          mimeType: 'text/html', // Should NOT be transformed
        },
      ],
    },
  ],
});
