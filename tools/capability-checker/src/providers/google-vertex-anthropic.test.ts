import { describe, it, expect } from 'vitest';
import {
  createVertexAnthropic as createVertexAnthropicNode,
  vertexAnthropic,
  vertexAnthropic as vertexAnthropicNode,
} from '@ai-sdk/google-vertex/anthropic';
import {
  createVertexAnthropic as createVertexAnthropicEdge,
  vertexAnthropic as vertexAnthropicEdge,
} from '@ai-sdk/google-vertex/anthropic/edge';
import { generateText, APICallError, LanguageModelV1 } from 'ai';
import fs from 'fs';
import {
  createFeatureTestSuite,
  createLanguageModelWithCapabilities,
} from '../feature-test-suite';
import { ModelConfig, ModelWithCapabilities } from '../types/model';
import 'dotenv/config';

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

const createBaseModel = (
  createVertexAnthropic:
    | typeof createVertexAnthropicNode
    | typeof createVertexAnthropicEdge,
  modelId: string,
): ModelWithCapabilities<LanguageModelV1> => {
  const model = createVertexAnthropic({
    project: process.env.GOOGLE_VERTEX_PROJECT!,
    location: process.env.GOOGLE_VERTEX_LOCATION ?? 'us-east5',
  })(modelId);

  return createLanguageModelWithCapabilities(model);
};

const createLanguageModel = (
  createVertexAnthropic:
    | typeof createVertexAnthropicNode
    | typeof createVertexAnthropicEdge,
  modelId: string,
  additionalTests: ((model: LanguageModelV1) => void)[] = [],
): ModelWithCapabilities<LanguageModelV1> => {
  const model = createVertexAnthropic({
    project: process.env.GOOGLE_VERTEX_PROJECT!,
    // Anthropic models are typically only available in us-east5 region.
    location: process.env.GOOGLE_VERTEX_LOCATION ?? 'us-east5',
  })(modelId);

  if (additionalTests.length > 0) {
    describe.each([createBaseModel(createVertexAnthropic, modelId)])(
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
): ModelWithCapabilities<LanguageModelV1>[] => [
  createBaseModel(createVertexAnthropic, modelId),
  createLanguageModel(createVertexAnthropic, modelId, [toolTests]),
];

const LONG_TEST_MILLIS = 20000;
const COMPUTER_USE_TEST_MILLIS = 45000;

export default function runTests(modelConfig: ModelConfig) {
  describe.each(Object.values(RUNTIME_VARIANTS))(
    'Vertex Anthropic E2E Tests - $name',
    ({ createVertexAnthropic }) => {
      switch (modelConfig.modelType) {
        case 'language':
          createFeatureTestSuite({
            name: `Vertex Anthropic (${createVertexAnthropic.name})`,
            models: {
              language: createModelVariants(
                createVertexAnthropic,
                modelConfig.modelId,
              ),
            },
            timeout: LONG_TEST_MILLIS,
            errorValidators: {
              language: (error: APICallError) => {
                expect(error.message).toMatch(/Model .* not found/);
              },
            },
          })();
          break;
      }
    },
  );
}

const toolTests = (model: LanguageModelV1) => {
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
        maxSteps: 5,
      });

      expect(result.text).toBeTruthy();
      expect(editorContent).not.toBe('## README\nThis is a test file.');
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    },
    { timeout: COMPUTER_USE_TEST_MILLIS },
  );
};
