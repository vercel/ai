import {
  createVertexAnthropic as createVertexAnthropicNode,
  vertexAnthropic,
  vertexAnthropic as vertexAnthropicNode,
} from '@ai-sdk/google-vertex/anthropic';
import {
  createVertexAnthropic as createVertexAnthropicEdge,
  vertexAnthropic as vertexAnthropicEdge,
} from '@ai-sdk/google-vertex/anthropic/edge';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { APICallError, generateText, stepCountIs } from 'ai';
import 'dotenv/config';
import fs from 'fs';
import { describe, expect, it } from 'vitest';
import {
  createFeatureTestSuite,
  createLanguageModelWithCapabilities,
  ModelWithCapabilities,
} from './feature-test-suite';

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

const createModelObject = (
  model: LanguageModelV2,
): { model: LanguageModelV2; modelId: string } => ({
  model: model,
  modelId: model.modelId,
});

const createLanguageModel = (
  createVertexAnthropic:
    | typeof createVertexAnthropicNode
    | typeof createVertexAnthropicEdge,
  modelId: string,
  additionalTests: ((model: LanguageModelV2) => void)[] = [],
): ModelWithCapabilities<LanguageModelV2> => {
  const model = createVertexAnthropic({
    project: process.env.GOOGLE_VERTEX_PROJECT!,
    // Anthropic models are typically only available in us-east5 region.
    location: process.env.GOOGLE_VERTEX_LOCATION ?? 'us-east5',
  })(modelId);

  if (additionalTests.length > 0) {
    describe.each([createModelObject(model)])(
      'Provider-specific tests: $modelId',
      ({ model }) => {
        additionalTests.forEach(test => test(model));
      },
    );
  }

  return createLanguageModelWithCapabilities(model);
};

const createModelVariants = (
  createVertexAnthropic:
    | typeof createVertexAnthropicNode
    | typeof createVertexAnthropicEdge,
  modelId: string,
): ModelWithCapabilities<LanguageModelV2>[] => [
  createLanguageModel(createVertexAnthropic, modelId, [toolTests]),
];

// Model variants to test against
const CHAT_MODELS = [
  'claude-3-5-sonnet-v2@20241022',
  // 'claude-3-5-haiku@20241022',
  // 'claude-3-5-sonnet@20240620',
  // Models must be individually enabled through the Cloud Console. The above are the latest and most likely to be used.
  // 'claude-3-haiku@20240307',
  // 'claude-3-sonnet@20240229',
  // 'claude-3-opus@20240229',
];

const createModelsForRuntime = (
  createVertexAnthropic:
    | typeof createVertexAnthropicNode
    | typeof createVertexAnthropicEdge,
) => ({
  languageModels: CHAT_MODELS.flatMap(modelId =>
    createModelVariants(createVertexAnthropic, modelId),
  ),
});

const LONG_TEST_MILLIS = 20000;
const COMPUTER_USE_TEST_MILLIS = 45000;

describe.each(Object.values(RUNTIME_VARIANTS))(
  'Vertex Anthropic E2E Tests - $name',
  ({ createVertexAnthropic }) => {
    createFeatureTestSuite({
      name: `Vertex Anthropic (${createVertexAnthropic.name})`,
      models: createModelsForRuntime(createVertexAnthropic),
      timeout: LONG_TEST_MILLIS,
      customAssertions: {
        skipUsage: false,
        errorValidator: (error: APICallError) => {
          expect(error.message).toMatch(/Model .* not found/);
        },
      },
    })();
  },
);

const toolTests = (model: LanguageModelV2) => {
  it.skipIf(!['claude-3-5-sonnet-v2@20241022'].includes(model.modelId))(
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
            toModelOutput(result) {
              return {
                type: 'content',
                value: [
                  typeof result === 'string'
                    ? { type: 'text', text: result }
                    : {
                        type: 'media',
                        data: result.data,
                        mediaType: 'image/png',
                      },
                ],
              };
            },
          }),
        },
        prompt:
          'How can I switch to dark mode? Take a look at the screen and tell me.',
        stopWhen: stepCountIs(5),
      });

      console.log(result.text);
      expect(result.text).toBeTruthy();
      expect(result.text.toLowerCase()).toMatch(/color theme|dark mode/);
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    },
    { timeout: COMPUTER_USE_TEST_MILLIS },
  );

  it.skipIf(!['claude-3-5-sonnet-v2@20241022'].includes(model.modelId))(
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
        stopWhen: stepCountIs(2),
      });

      expect(result.text).toBeTruthy();
      expect(result.text).toContain('README.md'); // Check for specific file
      expect(result.text).toContain('package.json'); // Check for another specific file
      expect(result.text).toContain('node_modules'); // Check for directory
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    },
    { timeout: COMPUTER_USE_TEST_MILLIS },
  );

  it.skipIf(!['claude-3-5-sonnet-v2@20241022'].includes(model.modelId))(
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
        stopWhen: stepCountIs(5),
      });

      expect(result.text).toBeTruthy();
      expect(editorContent).not.toBe('## README\nThis is a test file.');
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    },
    { timeout: COMPUTER_USE_TEST_MILLIS },
  );
};
