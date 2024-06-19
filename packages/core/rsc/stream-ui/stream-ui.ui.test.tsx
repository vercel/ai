import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import assert from 'node:assert';
import { z } from 'zod';
import { MockLanguageModelV1 } from '../../core/test/mock-language-model-v1';
import {
  openaiChatCompletionChunks,
  openaiFunctionCallChunks,
} from '../../tests/snapshots/openai-chat';
import {
  DEFAULT_TEST_URL,
  createMockServer,
} from '../../tests/utils/mock-server';
import { streamUI } from './stream-ui';

const FUNCTION_CALL_TEST_URL = DEFAULT_TEST_URL + 'mock-func-call';

const server = createMockServer([
  {
    url: DEFAULT_TEST_URL,
    chunks: openaiChatCompletionChunks,
    formatChunk: chunk => `data: ${JSON.stringify(chunk)}\n\n`,
    suffix: 'data: [DONE]',
  },
  {
    url: FUNCTION_CALL_TEST_URL,
    chunks: openaiFunctionCallChunks,
    formatChunk: chunk => `data: ${JSON.stringify(chunk)}\n\n`,
    suffix: 'data: [DONE]',
  },
]);

beforeAll(() => {
  server.listen();
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

async function recursiveResolve(val: any): Promise<any> {
  if (val && typeof val === 'object' && typeof val.then === 'function') {
    return await recursiveResolve(await val);
  }

  if (Array.isArray(val)) {
    return await Promise.all(val.map(recursiveResolve));
  }

  if (val && typeof val === 'object') {
    const result: any = {};
    for (const key in val) {
      result[key] = await recursiveResolve(val[key]);
    }
    return result;
  }

  return val;
}

async function simulateFlightServerRender(node: React.ReactNode) {
  async function traverse(node: React.ReactNode): Promise<any> {
    if (!node || typeof node !== 'object' || !('props' in node)) return {}; // only traverse React elements

    // Let's only do one level of promise resolution here. As it's only for testing purposes.
    const props = await recursiveResolve({ ...node.props } || {});

    const { type } = node;
    const { children, ...otherProps } = props;
    const typeName = typeof type === 'function' ? type.name : String(type);

    return {
      type: typeName,
      props: otherProps,
      children:
        typeof children === 'string'
          ? children
          : Array.isArray(children)
          ? children.map(traverse)
          : await traverse(children),
    };
  }

  return traverse(node);
}

const mockToolModel = new MockLanguageModelV1({
  doStream: async () => {
    return {
      stream: convertArrayToReadableStream([
        {
          type: 'tool-call',
          toolCallType: 'function',
          toolCallId: 'call-1',
          toolName: 'get_current_weather',
          args: `{}`,
        },
        {
          type: 'finish',
          finishReason: 'stop',
          logprobs: undefined,
          usage: { completionTokens: 10, promptTokens: 3 },
        },
      ]),
      rawCall: { rawPrompt: 'prompt', rawSettings: {} },
    };
  },
});

describe('rsc - streamUI()', () => {
  it('should emit React Nodes with sync streamUI function', async () => {
    const ui = await streamUI({
      model: mockToolModel,
      messages: [],
      tools: {
        get_current_weather: {
          description: 'Get the current weather',
          parameters: z.object({}),
          generate: () => {
            return <div>Weather</div>;
          },
        },
      },
    });

    const rendered = await simulateFlightServerRender(ui.value);
    expect(rendered).toMatchSnapshot();
  });

  it('should emit React Nodes with async streamUI function', async () => {
    const ui = await streamUI({
      model: mockToolModel,
      messages: [],
      tools: {
        get_current_weather: {
          description: 'Get the current weather',
          parameters: z.object({}),
          generate: async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return <div>Weather</div>;
          },
        },
      },
    });

    const rendered = await simulateFlightServerRender(ui.value);
    expect(rendered).toMatchSnapshot();
  });

  it('should emit React Nodes with generator streamUI function', async () => {
    const ui = await streamUI({
      model: mockToolModel,
      messages: [],
      tools: {
        get_current_weather: {
          description: 'Get the current weather',
          parameters: z.object({}),
          generate: async function* () {
            yield <div>Loading...</div>;
            await new Promise(resolve => setTimeout(resolve, 100));
            return <div>Weather</div>;
          },
        },
      },
    });

    const rendered = await simulateFlightServerRender(ui.value);
    expect(rendered).toMatchSnapshot();
  });
});

describe('rsc - streamUI() onFinish callback', () => {
  let result: Parameters<
    Required<Parameters<typeof streamUI>[0]>['onFinish']
  >[0];

  beforeEach(async () => {
    const ui = await streamUI({
      model: mockToolModel,
      messages: [],
      tools: {
        get_current_weather: {
          description: 'Get the current weather',
          parameters: z.object({}),
          generate: () => {
            return 'Weather';
          },
        },
      },
      onFinish: event => {
        result = event;
      },
    });

    // consume stream
    await simulateFlightServerRender(ui.value);
  });

  it('should contain token usage', () => {
    assert.deepStrictEqual(result.usage, {
      completionTokens: 10,
      promptTokens: 3,
      totalTokens: 13,
    });
  });

  it('should contain finish reason', async () => {
    assert.strictEqual(result.finishReason, 'stop');
  });

  it('should contain final React node', async () => {
    expect(result.value).toMatchSnapshot();
  });
});
