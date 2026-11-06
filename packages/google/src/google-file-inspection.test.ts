import type {
  LanguageModelV4FilePart,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convertToGoogleMessages } from './convert-to-google-messages';
import { type GoogleFilePartOptions } from './google-file-part-options';
import { createGoogle } from './google-provider';
import { convertToGoogleInteractionsInput } from './interactions/convert-to-google-interactions-input';
import { type GoogleInteractionsFileOptions } from './interactions/google-interactions-file-options';

const modelId = 'gemini-4-argon-file-processing-eap';
const fileUri =
  'https://generativelanguage.googleapis.com/v1beta/files/inspection';

// Expected request fields follow the EAP notebook, rather than recorded responses.
const cases = [
  {
    name: 'PDF pages',
    mediaType: 'application/pdf',
    metadata: { documentMetadata: { startPage: 3, endPage: 4 } },
    options: {
      processing: { type: 'static', pageOptions: { startPage: 3, endPage: 4 } },
    },
    expected: {
      type: 'document',
      processing: {
        type: 'static',
        page_options: { start_page: 3, end_page: 4 },
      },
    },
  },
  {
    name: 'Word text layers',
    mediaType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    metadata: {
      documentMetadata: {
        startPage: 2,
        endPage: 3,
        contentLayers: ['PAGE_TEXT'],
      },
    },
    options: {
      processing: {
        type: 'static',
        pageOptions: { startPage: 2, endPage: 3, contentLayers: ['page_text'] },
      },
    },
    expected: {
      type: 'document',
      processing: {
        type: 'static',
        page_options: {
          start_page: 2,
          end_page: 3,
          content_layers: ['page_text'],
        },
      },
    },
  },
  {
    name: 'PowerPoint visual layers',
    mediaType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    metadata: {
      documentMetadata: {
        startPage: 4,
        endPage: 5,
        contentLayers: ['PAGE_IMAGE'],
      },
    },
    options: {
      resolution: 'high',
      processing: {
        type: 'static',
        pageOptions: {
          startPage: 4,
          endPage: 5,
          contentLayers: ['page_image'],
        },
      },
    },
    expected: {
      type: 'document',
      resolution: 'high',
      processing: {
        type: 'static',
        page_options: {
          start_page: 4,
          end_page: 5,
          content_layers: ['page_image'],
        },
      },
    },
  },
  {
    name: 'spreadsheet cells and formulas',
    mediaType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    metadata: {
      spreadsheetMetadata: {
        sheetIndex: 3,
        visibleCells: 'A1:C5',
        contentLayers: ['DATA', 'FORMULAS'],
      },
    },
    options: {
      processing: {
        type: 'static',
        spreadsheetOptions: {
          sheetIndex: 3,
          visibleCells: 'A1:C5',
          contentLayers: ['data', 'formulas'],
        },
      },
    },
    expected: {
      type: 'document',
      processing: {
        type: 'static',
        spreadsheet_options: {
          sheet_index: 3,
          visible_cells: 'A1:C5',
          content_layers: ['data', 'formulas'],
        },
      },
    },
  },
  {
    name: 'OpenDocument sheet rendering',
    mediaType: 'application/vnd.oasis.opendocument.spreadsheet',
    metadata: {
      spreadsheetMetadata: { sheetIndex: 1, contentLayers: ['VISUAL'] },
    },
    options: {
      resolution: 'medium',
      processing: {
        type: 'static',
        spreadsheetOptions: { sheetIndex: 1, contentLayers: ['visual'] },
      },
    },
    expected: {
      type: 'document',
      resolution: 'medium',
      processing: {
        type: 'static',
        spreadsheet_options: { sheet_index: 1, content_layers: ['visual'] },
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
    options: {
      processing: {
        type: 'static',
        startOffset: 10,
        endOffset: 20,
        fps: 2,
        contentLayers: ['frames'],
      },
    },
    expected: {
      type: 'video',
      processing: {
        type: 'static',
        start_offset: '10s',
        end_offset: '20s',
        fps: 2,
        content_layers: ['frames'],
      },
    },
  },
  {
    name: 'audio clip starting at zero',
    mediaType: 'audio/mpeg',
    metadata: { audioMetadata: { startOffset: '0s', endOffset: '30.5s' } },
    options: {
      processing: { type: 'static', startOffset: 0, endOffset: 30.5 },
    },
    expected: {
      type: 'audio',
      processing: { type: 'static', start_offset: '0s', end_offset: '30.5s' },
    },
  },
] satisfies Array<{
  name: string;
  mediaType: string;
  metadata: GoogleFilePartOptions;
  options: GoogleInteractionsFileOptions;
  expected: Record<string, unknown>;
}>;

const dataCases: Array<{
  name: string;
  data: LanguageModelV4FilePart['data'];
  inline: boolean;
}> = [
  {
    name: 'bytes',
    data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
    inline: true,
  },
  { name: 'base64', data: { type: 'data', data: 'AQID' }, inline: true },
  {
    name: 'uploaded URL',
    data: { type: 'url', url: new URL(fileUri) },
    inline: false,
  },
  {
    name: 'provider reference',
    data: { type: 'reference', reference: { google: fileUri } },
    inline: false,
  },
];

function toPrompt(
  part: LanguageModelV4FilePart,
  toolResult: boolean,
): LanguageModelV4Prompt {
  return toolResult
    ? [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'view_file',
              output: { type: 'content', value: [part] },
            },
          ],
        },
      ]
    : [{ role: 'user', content: [part] }];
}

describe.each([false, true])(
  'file inspection in tool results: %s',
  toolResult => {
    describe.each(dataCases)('$name', ({ data, inline }) => {
      it.each(cases)(
        'serializes GenerateContent $name',
        ({ mediaType, metadata }) => {
          const prompt = toPrompt(
            {
              type: 'file',
              mediaType,
              data,
              providerOptions: { google: metadata },
            },
            toolResult,
          );
          const result = convertToGoogleMessages(prompt);
          const expected = {
            ...(inline
              ? { inlineData: { mimeType: mediaType, data: 'AQID' } }
              : { fileData: { mimeType: mediaType, fileUri } }),
            ...metadata,
          };
          expect(result.contents[0].parts[0]).toEqual(
            toolResult
              ? {
                  functionResponse: {
                    id: 'call-1',
                    name: 'view_file',
                    response: {
                      name: 'view_file',
                      content: 'Tool executed successfully.',
                    },
                    parts: [expected],
                  },
                }
              : expected,
          );
        },
      );

      it.each(cases)(
        'serializes Interactions $name',
        ({ mediaType, options, expected }) => {
          const prompt = toPrompt(
            {
              type: 'file',
              mediaType,
              data,
              providerOptions: { google: options },
            },
            toolResult,
          );
          const result = convertToGoogleInteractionsInput({ prompt });
          const block = {
            ...expected,
            mime_type: mediaType,
            ...(inline ? { data: 'AQID' } : { uri: fileUri }),
          };
          expect(result.input).toEqual([
            {
              type: 'user_input',
              content: toolResult
                ? [
                    {
                      type: 'function_result',
                      call_id: 'call-1',
                      name: 'view_file',
                      result: [block],
                    },
                  ]
                : [block],
            },
          ]);
          expect(result.warnings).toEqual([]);
        },
      );
    });
  },
);

it('keeps multiple selections of the same workbook separate', () => {
  const result = convertToGoogleInteractionsInput({
    prompt: [
      {
        role: 'user',
        content: [1, 3].map(sheetIndex => ({
          type: 'file',
          mediaType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          data: { type: 'reference', reference: { google: fileUri } },
          providerOptions: {
            google: {
              processing: {
                type: 'static',
                spreadsheetOptions: { sheetIndex },
              },
            },
          },
        })),
      },
    ],
  });
  expect(result.input).toEqual([
    {
      type: 'user_input',
      content: [1, 3].map(sheetIndex => ({
        type: 'document',
        uri: fileUri,
        mime_type:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        processing: {
          type: 'static',
          spreadsheet_options: { sheet_index: sheetIndex },
        },
      })),
    },
  ]);
});

it('uses per-file resolution before the call-level default', () => {
  const result = convertToGoogleInteractionsInput({
    mediaResolution: 'low',
    prompt: toPrompt(
      {
        type: 'file',
        mediaType: 'application/pdf',
        data: { type: 'data', data: 'AQID' },
        providerOptions: { google: { resolution: 'high' } },
      },
      false,
    ),
  });
  expect(result.input).toEqual([
    {
      type: 'user_input',
      content: [
        {
          type: 'document',
          data: 'AQID',
          mime_type: 'application/pdf',
          resolution: 'high',
        },
      ],
    },
  ]);
});

it.each([
  { processing: { pageOptions: { startPage: 3 } } },
  { processing: { type: 'static', spreadsheetOptions: [{ sheetIndex: 1 }] } },
  { processing: { type: 'static', pageOptions: { startPage: 0 } } },
])(
  'rejects malformed inspection options before sending the whole file: %j',
  google => {
    expect(() =>
      convertToGoogleInteractionsInput({
        prompt: toPrompt(
          {
            type: 'file',
            mediaType: 'application/pdf',
            data: { type: 'data', data: 'AQID' },
            providerOptions: { google },
          },
          false,
        ),
      }),
    ).toThrow();
  },
);

describe.each(['generateContent', 'interactions'] as const)(
  '%s requests',
  surface => {
    it.each([false, true])(
      'sends inspection fields to v1beta with streaming: %s',
      async streaming => {
        let requestUrl = '';
        let requestBody: Record<string, any> = {};
        const provider = createGoogle({
          apiKey: 'test-key',
          fetch: async (url, init) => {
            requestUrl = String(url);
            requestBody = JSON.parse(String(init?.body));
            if (surface === 'interactions') {
              return new Response(
                readFileSync(
                  `src/interactions/__fixtures__/basic.${streaming ? 'chunks.txt' : 'json'}`,
                  'utf8',
                ),
                {
                  headers: {
                    'content-type': streaming
                      ? 'text/event-stream'
                      : 'application/json',
                  },
                },
              );
            }
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
        const model =
          surface === 'interactions'
            ? provider.interactions(modelId)
            : provider(modelId);
        const document = cases[0];
        const prompt = toPrompt(
          {
            type: 'file',
            mediaType: document.mediaType,
            data: { type: 'reference', reference: { google: fileUri } },
            providerOptions: {
              google:
                surface === 'interactions'
                  ? document.options
                  : document.metadata,
            },
          },
          true,
        );
        if (streaming) {
          const result = await model.doStream({ prompt });
          const parts = await convertReadableStreamToArray(result.stream);
          expect(parts.some(part => part.type === 'error')).toBe(false);
          expect(parts.some(part => part.type === 'finish')).toBe(true);
        } else {
          const result = await model.doGenerate({ prompt });
          expect(result.content.some(part => part.type === 'text')).toBe(true);
        }
        expect(requestUrl).toContain('/v1beta/');
        if (surface === 'interactions') {
          expect(requestBody.model).toBe(modelId);
          expect(requestBody.input[0].content[0].result[0]).toEqual({
            ...document.expected,
            uri: fileUri,
            mime_type: 'application/pdf',
          });
        } else {
          expect(requestUrl).toContain(
            `/models/${modelId}:${streaming ? 'streamGenerateContent' : 'generateContent'}`,
          );
          expect(
            requestBody.contents[0].parts[0].functionResponse.parts[0],
          ).toEqual({
            fileData: { fileUri, mimeType: 'application/pdf' },
            documentMetadata: { startPage: 3, endPage: 4 },
          });
        }
        const supportedUrls = await model.supportedUrls;
        expect(supportedUrls['*'].some(pattern => pattern.test(fileUri))).toBe(
          true,
        );
      },
    );
  },
);
