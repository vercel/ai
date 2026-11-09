import type { JSONValue, LanguageModelV2FilePart } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { convertToGoogleGenerativeAIMessages } from './convert-to-google-generative-ai-messages';
import type { GoogleFilePartOptions } from './google-file-part-options';
import { createGoogleGenerativeAI } from './google-provider';

const fileUri =
  'https://generativelanguage.googleapis.com/v1beta/files/inspection';
const cases: Array<{
  name: string;
  mediaType: string;
  metadata: GoogleFilePartOptions & Record<string, JSONValue>;
}> = [
  {
    name: 'PDF pages',
    mediaType: 'application/pdf',
    metadata: {
      documentMetadata: {
        startPage: 3,
        endPage: 4,
        contentLayers: ['PAGE_TEXT'],
      },
    },
  },
  {
    name: 'Word text',
    mediaType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    metadata: {
      documentMetadata: {
        startPage: 2,
        endPage: 3,
        contentLayers: ['PAGE_TEXT'],
      },
    },
  },
  {
    name: 'PowerPoint renderings',
    mediaType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    metadata: {
      mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' },
      documentMetadata: {
        startPage: 4,
        contentLayers: ['PAGE_IMAGE'],
      },
    },
  },
  {
    name: 'Excel cells',
    mediaType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    metadata: {
      spreadsheetMetadata: {
        sheetIndex: 3,
        visibleCells: 'A1:C5',
        contentLayers: ['DATA', 'FORMULAS'],
      },
    },
  },
  {
    name: 'OpenDocument sheet',
    mediaType: 'application/vnd.oasis.opendocument.spreadsheet',
    metadata: {
      spreadsheetMetadata: {
        sheetIndex: 1,
        visibleCells: 'B5',
        contentLayers: ['VISUAL'],
      },
    },
  },
  {
    name: 'video frames',
    mediaType: 'video/mp4',
    metadata: {
      videoMetadata: {
        startOffset: '10s',
        endOffset: '20s',
        fps: 2,
        contentLayers: ['FRAMES'],
      },
    },
  },
  {
    name: 'audio clip',
    mediaType: 'audio/mpeg',
    metadata: {
      audioMetadata: {
        startOffset: '0s',
        endOffset: '30.5s',
      },
    },
  },
];
const dataCases: Array<{
  name: string;
  data: LanguageModelV2FilePart['data'];
  inline: boolean;
}> = [
  { name: 'bytes', data: new Uint8Array([1, 2, 3]), inline: true },
  { name: 'base64', data: 'AQID', inline: true },
  { name: 'uploaded URL', data: new URL(fileUri), inline: false },
];

describe.each(dataCases)('$name', ({ data, inline }) => {
  it.each(cases)(
    'serializes $name inspection fields',
    ({ mediaType, metadata }) => {
      const result = convertToGoogleGenerativeAIMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType,
              data,
              providerOptions: { google: metadata },
            },
          ],
        },
      ]);
      expect(result.contents[0].parts[0]).toEqual({
        ...(inline
          ? { inlineData: { mimeType: mediaType, data: 'AQID' } }
          : { fileData: { mimeType: mediaType, fileUri } }),
        ...metadata,
      });
    },
  );
});

const invalidOptions: Array<Record<string, JSONValue>> = [
  { documentMetadata: { startPage: 0 } },
  { spreadsheetMetadata: { sheetIndex: 0 } },
  { videoMetadata: { fps: 25 } },
];
it.each(invalidOptions)('rejects malformed inspection options: %j', google => {
  expect(() =>
    convertToGoogleGenerativeAIMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'application/pdf',
            data: 'AQID',
            providerOptions: { google },
          },
        ],
      },
    ]),
  ).toThrow();
});

it.each([false, true])(
  'sends inspection fields to v1beta (streaming: %s)',
  async streaming => {
    let requestUrl = '';
    let requestBody: Record<string, any> = {};
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-key',
      fetch: async (url, init) => {
        requestUrl = String(url);
        requestBody = JSON.parse(String(init?.body));
        const response = {
          candidates: [
            {
              content: { role: 'model', parts: [{ text: 'ok' }] },
              finishReason: 'STOP',
            },
          ],
        };
        return new Response(
          streaming
            ? `data: ${JSON.stringify(response)}\n\n`
            : JSON.stringify(response),
          {
            headers: {
              'content-type': streaming
                ? 'text/event-stream'
                : 'application/json',
            },
          },
        );
      },
    });
    const model = provider('gemini-4-argon-file-processing-eap');
    const prompt = [
      {
        role: 'user' as const,
        content: [
          {
            type: 'file' as const,
            mediaType: 'application/pdf',
            data: new URL(fileUri),
            providerOptions: {
              google: {
                mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' },
                documentMetadata: {
                  startPage: 3,
                  endPage: 4,
                  contentLayers: ['PAGE_TEXT'],
                },
              },
            },
          },
        ],
      },
    ];
    if (streaming) {
      const result = await model.doStream({ prompt });
      const parts = await convertReadableStreamToArray(result.stream);
      expect(parts.some(part => part.type === 'error')).toBe(false);
      expect(parts.some(part => part.type === 'finish')).toBe(true);
    } else {
      const result = await model.doGenerate({ prompt });
      expect(result.content.some(part => part.type === 'text')).toBe(true);
    }
    expect(requestUrl).toContain(
      `/v1beta/models/gemini-4-argon-file-processing-eap:${streaming ? 'streamGenerateContent' : 'generateContent'}`,
    );
    expect(requestBody.contents[0].parts[0]).toEqual({
      fileData: { mimeType: 'application/pdf', fileUri },
      mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' },
      documentMetadata: {
        startPage: 3,
        endPage: 4,
        contentLayers: ['PAGE_TEXT'],
      },
    });
    expect(
      (await model.supportedUrls)['*'].some(pattern => pattern.test(fileUri)),
    ).toBe(true);
  },
);
