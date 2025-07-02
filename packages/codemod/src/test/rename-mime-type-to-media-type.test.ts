import { defineInlineTest } from 'jscodeshift/src/testUtils';
import transform from '../codemods/rename-mime-type-to-media-type';

defineInlineTest(
  { default: transform, parser: 'tsx' },
  {},
  `
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await streamText({
  model: openai('gpt-4-turbo'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          data: contents,
          mimeType: 'application/pdf',
        }
      ]
    }
  ]
});
  `,
  `
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await streamText({
  model: openai('gpt-4-turbo'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          data: contents,
          mediaType: 'application/pdf',
        }
      ]
    }
  ]
});
  `,
  'should rename mimeType to mediaType in streamText',
);

defineInlineTest(
  { default: transform, parser: 'tsx' },
  {},
  `
import { generateText, generateObject, streamObject } from 'ai';
import { openai } from '@ai-sdk/openai';

const result1 = await generateText({
  model: openai('gpt-4o'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          data: imageBuffer,
          mimeType: 'image/jpeg',
        }
      ]
    }
  ]
});

const result2 = await generateObject({
  model: openai('gpt-4o'),
  schema: schema,
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          data: docBuffer,
          mimeType: 'application/msword',
        }
      ]
    }
  ]
});

const result3 = await streamObject({
  model: openai('gpt-4o'),
  schema: schema,
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          data: xlsBuffer,
          mimeType: 'application/vnd.ms-excel',
        }
      ]
    }
  ]
});
  `,
  `
import { generateText, generateObject, streamObject } from 'ai';
import { openai } from '@ai-sdk/openai';

const result1 = await generateText({
  model: openai('gpt-4o'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          data: imageBuffer,
          mediaType: 'image/jpeg',
        }
      ]
    }
  ]
});

const result2 = await generateObject({
  model: openai('gpt-4o'),
  schema: schema,
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          data: docBuffer,
          mediaType: 'application/msword',
        }
      ]
    }
  ]
});

const result3 = await streamObject({
  model: openai('gpt-4o'),
  schema: schema,
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          data: xlsBuffer,
          mediaType: 'application/vnd.ms-excel',
        }
      ]
    }
  ]
});
  `,
  'should handle multiple AI methods with mimeType transformations',
);

defineInlineTest(
  { default: transform, parser: 'tsx' },
  {},
  `
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await streamText({
  model: openai('gpt-4-turbo'),
  messages: [
    {
      role: 'user',
      content: [
        {
          'type': 'file',
          'data': videoBuffer,
          'mimeType': 'video/mp4',
        }
      ]
    }
  ]
});
  `,
  `
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await streamText({
  model: openai('gpt-4-turbo'),
  messages: [
    {
      role: 'user',
      content: [
        {
          'type': 'file',
          'data': videoBuffer,
          'mediaType': 'video/mp4',
        }
      ]
    }
  ]
});
  `,
  'should handle string-quoted property names',
);

defineInlineTest(
  { default: transform, parser: 'tsx' },
  {},
  `
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

// This should NOT be transformed (not type: 'file')
const result = await streamText({
  model: openai('gpt-4-turbo'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          url: 'https://example.com/image.jpg',
          mimeType: 'image/jpeg',
        },
        {
          type: 'file',
          data: pdfBuffer,
          mimeType: 'application/pdf',
        }
      ]
    }
  ]
});

// This should NOT be transformed (not an AI function)
const nonAiResult = await someOtherFunction({
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          data: buffer,
          mimeType: 'text/html',
        }
      ]
    }
  ]
});
  `,
  `
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

// This should NOT be transformed (not type: 'file')
const result = await streamText({
  model: openai('gpt-4-turbo'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          url: 'https://example.com/image.jpg',
          mimeType: 'image/jpeg',
        },
        {
          type: 'file',
          data: pdfBuffer,
          mediaType: 'application/pdf',
        }
      ]
    }
  ]
});

// This should NOT be transformed (not an AI function)
const nonAiResult = await someOtherFunction({
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          data: buffer,
          mimeType: 'text/html',
        }
      ]
    }
  ]
});
  `,
  'should only transform mimeType in file content objects within AI methods',
);

defineInlineTest(
  { default: transform, parser: 'tsx' },
  {},
  `
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await generateText({
  model: openai('gpt-4o'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          data: file1,
          mimeType: 'text/plain',
        }
      ]
    },
    {
      role: 'assistant',
      content: 'I can see the text file. What would you like me to do with it?'
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
          mimeType: 'image/png',
        }
      ]
    }
  ]
});
  `,
  `
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await generateText({
  model: openai('gpt-4o'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          data: file1,
          mediaType: 'text/plain',
        }
      ]
    },
    {
      role: 'assistant',
      content: 'I can see the text file. What would you like me to do with it?'
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
        }
      ]
    }
  ]
});
  `,
  'should handle multiple messages with multiple file content objects',
);
