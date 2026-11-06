import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createVertex } from '@ai-sdk/google-vertex';
import { describe, expect, it } from 'vitest';
import { generateText } from './generate-text';
import { streamText } from './stream-text';
import { jsonSchema } from '@ai-sdk/provider-utils';

describe.each(['gemini-2.5-flash', 'gemini-3-flash-preview'])(
  'Google toolChoice none on %s',
  modelId => {
    it.each(
      ['fileSearch', 'vertexRagStore'].flatMap(retrieval =>
        [false, true].flatMap(mixed =>
          ['generateText', 'streamText'].flatMap(mode =>
            ['none', 'auto'].map(toolChoice => ({
              retrieval,
              mixed,
              mode,
              toolChoice: toolChoice as 'none' | 'auto',
            })),
          ),
        ),
      ),
    )(
      '$mode with $retrieval, mixed=$mixed and toolChoice=$toolChoice',
      async ({ retrieval, mixed, mode, toolChoice }) => {
        const requests: Array<{
          tools?: unknown[];
          toolConfig?: unknown;
        }> = [];
        const settings = {
          apiKey: 'test-api-key',
          fetch: async (
            _url: Parameters<typeof fetch>[0],
            init?: RequestInit,
          ) => {
            requests.push(JSON.parse(init!.body as string));
            const body = {
              candidates: [
                {
                  content: { role: 'model', parts: [{ text: 'Hello.' }] },
                  finishReason: 'STOP',
                },
              ],
            };
            return mode === 'generateText'
              ? Response.json(body)
              : new Response(`data: ${JSON.stringify(body)}\n\n`, {
                  headers: { 'Content-Type': 'text/event-stream' },
                });
          },
        };
        const provider =
          retrieval === 'fileSearch'
            ? createGoogleGenerativeAI(settings)
            : createVertex({
                ...settings,
                project: 'synthetic',
                location: 'us-central1',
                googleAuthOptions: {
                  authClient: {
                    getAccessToken: async () => ({ token: 'test-token' }),
                  } as NonNullable<
                    NonNullable<
                      Parameters<typeof createVertex>[0]
                    >['googleAuthOptions']
                  >['authClient'],
                },
              });
        const retrievalTool =
          retrieval === 'fileSearch'
            ? provider.tools.fileSearch({
                fileSearchStoreNames: ['fileSearchStores/synthetic-store'],
              })
            : provider.tools.vertexRagStore({
                ragCorpus:
                  'projects/synthetic/locations/us-central1/ragCorpora/unused',
              });
        const options = {
          model: provider(modelId),
          prompt: 'Say hello.',
          tools: {
            retrieval: retrievalTool,
            ...(mixed && {
              lookup: {
                description: 'Synthetic function',
                inputSchema: jsonSchema({ type: 'object', properties: {} }),
              },
            }),
          },
          toolChoice,
          maxRetries: 0,
        };
        const result =
          mode === 'generateText'
            ? await generateText(options)
            : streamText(options);

        expect(await result.text).toBe('Hello.');
        expect(requests).toHaveLength(1);
        const request = requests[0];
        const expectedRetrieval =
          retrieval === 'fileSearch'
            ? {
                fileSearch: {
                  fileSearchStoreNames: ['fileSearchStores/synthetic-store'],
                },
              }
            : {
                retrieval: {
                  vertex_rag_store: {
                    rag_resources: {
                      rag_corpus:
                        'projects/synthetic/locations/us-central1/ragCorpora/unused',
                    },
                  },
                },
              };
        if (toolChoice === 'auto') {
          expect(request.tools).toContainEqual(expectedRetrieval);
        } else if (mixed) {
          expect(request.tools).toEqual([
            {
              functionDeclarations: [
                {
                  name: 'lookup',
                  description: 'Synthetic function',
                },
              ],
            },
          ]);
          expect(request.toolConfig).toEqual({
            functionCallingConfig: { mode: 'NONE' },
          });
        } else {
          expect(request.tools).toBeUndefined();
          expect(request.toolConfig).toBeUndefined();
        }
      },
    );
  },
);
