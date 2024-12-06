import 'dotenv/config';
import { describe, it, expect, vi } from 'vitest';
import {
  createVertexAnthropic as createVertexAnthropicNode,
  vertexAnthropic as vertexAnthropicNode,
} from '@ai-sdk/google-vertex/anthropic';
import {
  createVertexAnthropic as createVertexAnthropicEdge,
  vertexAnthropic as vertexAnthropicEdge,
} from '@ai-sdk/google-vertex/anthropic/edge';
import { generateText, streamText, generateObject } from 'ai';
import fs from 'fs';
import { z } from 'zod';
import {
  CoreMessage,
  GenerateTextResult,
  ToolCallPart,
  ToolResultPart,
} from 'ai';

const LONG_TEST_MILLIS = 20000;
const COMPUTER_USE_TEST_MILLIS = 45000;

// Model variants to test against
const MODEL_VARIANTS = {
  chat: [
    'claude-3-5-sonnet-v2@20241022',
    'claude-3-5-haiku@20241022',
    'claude-3-5-sonnet@20240620',
    // Models must be individually enabled through the Cloud Console. The above are the latest and most likely to be used.
    // 'claude-3-haiku@20240307',
    // 'claude-3-sonnet@20240229',
    // 'claude-3-opus@20240229',
  ],
} as const;

// Define runtime variants
const RUNTIME_VARIANTS = {
  edge: {
    name: 'Edge Runtime',
    createVertexAnthropic: createVertexAnthropicEdge,
    vertexAnthropic: vertexAnthropicEdge,
  },
  node: {
    name: 'Node Runtime',
    createVertexAnthropic: createVertexAnthropicNode,
    vertexAnthropic: vertexAnthropicNode,
  },
} as const;

type AnthropicProviderMetadata = {
  anthropic?: {
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
};

describe.each(Object.values(RUNTIME_VARIANTS))(
  'Vertex Anthropic E2E Tests - $name',
  ({ createVertexAnthropic, vertexAnthropic }) => {
    vi.setConfig({ testTimeout: LONG_TEST_MILLIS });

    const provider = createVertexAnthropic({
      project: process.env.GOOGLE_VERTEX_PROJECT!,
      location: process.env.GOOGLE_VERTEX_LOCATION ?? 'us-central1',
    });

    describe.each(MODEL_VARIANTS.chat)('Chat Model: %s', modelId => {
      const model = provider(modelId);

      it('should generate text', async () => {
        const result = await generateText({
          model,
          prompt: 'Write a haiku about programming.',
        });

        expect(result.text).toBeTruthy();
        expect(result.usage?.totalTokens).toBeGreaterThan(0);
      });

      it('should generate text with system prompt', async () => {
        const result = await generateText({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant.',
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Write a haiku about programming.' },
              ],
            },
          ],
        });

        expect(result.text).toBeTruthy();
        expect(result.usage?.totalTokens).toBeGreaterThan(0);
      });

      it('should stream text', async () => {
        const result = streamText({
          model,
          prompt: 'Count from 1 to 5 slowly.',
        });

        const chunks: string[] = [];
        for await (const chunk of result.textStream) {
          chunks.push(chunk);
        }

        expect(chunks.length).toBeGreaterThan(0);
        expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
      });

      it.skipIf(['claude-3-5-haiku@20241022'].includes(modelId))(
        'should generate text with image input',
        async () => {
          const result = await generateText({
            model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Describe the image in detail.' },
                  {
                    type: 'image',
                    image: fs
                      .readFileSync('./data/comic-cat.png')
                      .toString('base64'),
                  },
                ],
              },
            ],
          });

          expect(result.text.toLowerCase()).toContain('cat');
          expect(result.usage?.totalTokens).toBeGreaterThan(0);
        },
      );

      // Anthropic doesn't support PDF input yet through Vertex AI.
      it.skip('should generate text with PDF input', async () => {
        const result = await generateText({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Summarize the contents of this PDF.' },
                {
                  type: 'file',
                  data: fs.readFileSync('./data/ai.pdf').toString('base64'),
                  mimeType: 'application/pdf',
                },
              ],
            },
          ],
        });

        expect(result.text).toBeTruthy();
        expect(result.text.toLowerCase()).toContain('embedding');
        expect(result.usage?.totalTokens).toBeGreaterThan(0);
      });

      it.skipIf(['claude-3-5-haiku@20241022'].includes(modelId))(
        'should stream text with image input',
        async () => {
          const result = streamText({
            model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Describe the image in detail.' },
                  {
                    type: 'image',
                    image: fs
                      .readFileSync('./data/comic-cat.png')
                      .toString('base64'),
                  },
                ],
              },
            ],
          });

          const chunks: string[] = [];
          for await (const chunk of result.textStream) {
            chunks.push(chunk);
          }

          const fullText = chunks.join('');
          expect(fullText.toLowerCase()).toContain('cat');
          expect(chunks.length).toBeGreaterThan(0);
          expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
        },
      );

      it('should generate text with tool calls', async () => {
        const result = await generateText({
          model,
          prompt: 'What is 2+2? Use the calculator tool to compute this.',
          tools: {
            calculator: {
              parameters: z.object({
                expression: z
                  .string()
                  .describe('The mathematical expression to evaluate'),
              }),
              execute: async ({ expression }) => eval(expression).toString(),
            },
          },
        });

        expect(result.toolCalls?.[0]).toMatchObject({
          toolName: 'calculator',
          args: { expression: '2+2' },
        });
        expect(result.toolResults?.[0].result).toBe('4');
        expect(result.usage?.totalTokens).toBeGreaterThan(0);
      });

      it('should generate object', async () => {
        const result = await generateObject({
          model,
          schema: z.object({
            title: z.string(),
            tags: z.array(z.string()),
          }),
          prompt: 'Generate metadata for a blog post about TypeScript.',
        });

        expect(result.object.title).toBeTruthy();
        expect(Array.isArray(result.object.tags)).toBe(true);
        expect(result.usage?.totalTokens).toBeGreaterThan(0);
      });

      // Anthropic doesn't support cache control yet through Vertex AI.
      it.skip('should support cache control', async () => {
        const model = provider(modelId, { cacheControl: true });

        // First request - should create a cache
        const messages: CoreMessage[] = [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'You are a helpful assistant.' },
              { type: 'text', text: 'What is 2+2?' },
            ],
          },
        ];

        const result1 = (await generateText({
          model,
          messages,
        })) as GenerateTextResult<Record<string, never>, never> &
          AnthropicProviderMetadata;

        expect(result1.text).toBeTruthy();
        expect(result1.anthropic?.cacheCreationInputTokens).toBeGreaterThan(0);
        expect(result1.anthropic?.cacheReadInputTokens).toBe(0);

        // Second request with same cached content - should hit the cache
        const result2 = (await generateText({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'You are a helpful assistant.' },
                { type: 'text', text: 'What is 3+3?' },
              ],
            },
          ],
        })) as GenerateTextResult<Record<string, never>, never> &
          AnthropicProviderMetadata;

        expect(result2.text).toBeTruthy();
        expect(result2.anthropic?.cacheCreationInputTokens).toBe(0);
        expect(result2.anthropic?.cacheReadInputTokens).toBeGreaterThan(0);
      });

      it('should stream text with tool calls', async () => {
        const result = streamText({
          model,
          prompt: 'Calculate 5+7 using the calculator tool.',
          tools: {
            calculator: {
              parameters: z.object({
                expression: z.string(),
              }),
              execute: async ({ expression }) => eval(expression).toString(),
            },
          },
          toolChoice: 'required',
        });

        const parts = [];
        let fullResponse = '';
        const toolCalls: ToolCallPart[] = [];
        const toolResponses: ToolResultPart[] = [];

        for await (const delta of result.fullStream) {
          switch (delta.type) {
            case 'text-delta': {
              fullResponse += delta.textDelta;
              parts.push(delta);
              break;
            }
            case 'tool-call': {
              toolCalls.push(delta);
              parts.push(delta);
              break;
            }
            case 'tool-result': {
              toolResponses.push(delta);
              parts.push(delta);
              break;
            }
          }
        }

        // Validate we got both a tool call and response
        expect(toolCalls).toHaveLength(1);
        expect(toolResponses).toHaveLength(1);

        // Validate the calculation 5+7=12
        expect(toolCalls[0]).toMatchObject({
          type: 'tool-call',
          toolName: 'calculator',
          args: { expression: '5+7' },
        });

        expect(toolResponses[0]).toMatchObject({
          type: 'tool-result',
          toolName: 'calculator',
          result: '12',
        });

        expect((await result.usage)?.totalTokens).toBeGreaterThan(0);
      });

      it.skipIf(!['claude-3-5-sonnet-v2@20241022'].includes(modelId))(
        'should execute computer tool commands',
        async () => {
          const result = await generateText({
            model,
            tools: {
              computer: vertexAnthropic.tools.computer_20241022({
                displayWidthPx: 1024,
                displayHeightPx: 768,
                async execute({ action, coordinate, text }) {
                  switch (action) {
                    case 'screenshot': {
                      return {
                        type: 'image',
                        data: fs
                          .readFileSync('./data/screenshot-editor.png')
                          .toString('base64'),
                      };
                    }
                    default: {
                      return `executed ${action}`;
                    }
                  }
                },
                experimental_toToolResultContent(result) {
                  return typeof result === 'string'
                    ? [{ type: 'text', text: result }]
                    : [
                        {
                          type: 'image',
                          data: result.data,
                          mimeType: 'image/png',
                        },
                      ];
                },
              }),
            },
            prompt:
              'How can I switch to dark mode? Take a look at the screen and tell me.',
            maxSteps: 5,
          });

          console.log(result.text);
          expect(result.text).toBeTruthy();
          expect(result.text.toLowerCase()).toMatch(/color theme|dark mode/);
          expect(result.usage?.totalTokens).toBeGreaterThan(0);
        },
        { timeout: COMPUTER_USE_TEST_MILLIS },
      );

      it.skipIf(!['claude-3-5-sonnet-v2@20241022'].includes(modelId))(
        'should execute computer use bash tool commands',
        async () => {
          const result = await generateText({
            model,
            tools: {
              bash: vertexAnthropic.tools.bash_20241022({
                async execute({ command }) {
                  return [
                    {
                      type: 'text',
                      text: `
❯ ${command}
README.md     build         data          node_modules  package.json  src           tsconfig.json
`,
                    },
                  ];
                },
              }),
            },
            prompt: 'List the files in my directory.',
            maxSteps: 2,
          });

          expect(result.text).toBeTruthy();
          expect(result.text).toContain('README.md'); // Check for specific file
          expect(result.text).toContain('package.json'); // Check for another specific file
          expect(result.text).toContain('node_modules'); // Check for directory
          expect(result.usage?.totalTokens).toBeGreaterThan(0);
        },
        { timeout: COMPUTER_USE_TEST_MILLIS },
      );

      it.skipIf(!['claude-3-5-sonnet-v2@20241022'].includes(modelId))(
        'should execute computer user editor tool commands',
        async () => {
          let editorContent = '## README\nThis is a test file.';

          const result = await generateText({
            model,
            tools: {
              str_replace_editor: vertexAnthropic.tools.textEditor_20241022({
                async execute({ command, path, old_str, new_str }) {
                  switch (command) {
                    case 'view': {
                      return editorContent;
                    }
                    case 'create':
                    case 'insert': {
                      editorContent = new_str!;
                      return editorContent;
                    }
                    case 'str_replace': {
                      editorContent = editorContent.replace(old_str!, new_str!);
                      return editorContent;
                    }
                    default:
                      return '';
                  }
                },
              }),
            },
            prompt: 'Update my README file to talk about AI.',
            maxSteps: 5,
          });

          expect(result.text).toBeTruthy();
          expect(editorContent).not.toBe('## README\nThis is a test file.');
          expect(result.usage?.totalTokens).toBeGreaterThan(0);
        },
        { timeout: COMPUTER_USE_TEST_MILLIS },
      );
    });
  },
);
