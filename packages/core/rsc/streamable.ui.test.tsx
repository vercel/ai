import {
  openaiChatCompletionChunks,
  openaiFunctionCallChunks,
} from '../tests/snapshots/openai-chat';
import { DEFAULT_TEST_URL, createMockServer } from '../tests/utils/mock-server';
import { render } from './streamable';
import { z } from 'zod';

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

async function simulateFlightServerRender(node: React.ReactElement) {
  async function traverse(node: any): Promise<any> {
    if (!node) return {};

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

function createMockUpProvider() {
  return {
    chat: {
      completions: {
        create: async () => {
          return await fetch(FUNCTION_CALL_TEST_URL);
        },
      },
    },
  } as any;
}

describe('rsc - streamable', () => {
  it('should emit React Nodes with sync render function', async () => {
    const ui = render({
      model: 'gpt-3.5-turbo',
      messages: [],
      provider: createMockUpProvider(),
      functions: {
        get_current_weather: {
          description: 'Get the current weather',
          parameters: z.object({}),
          render: () => {
            return <div>Weather</div>;
          },
        },
      },
    });

    const rendered = await simulateFlightServerRender(ui as any);
    expect(rendered).toMatchSnapshot();
  });

  it('should emit React Nodes with async render function', async () => {
    const ui = render({
      model: 'gpt-3.5-turbo',
      messages: [],
      provider: createMockUpProvider(),
      functions: {
        get_current_weather: {
          description: 'Get the current weather',
          parameters: z.object({}),
          render: async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return <div>Weather</div>;
          },
        },
      },
    });

    const rendered = await simulateFlightServerRender(ui as any);
    expect(rendered).toMatchSnapshot();
  });

  it('should emit React Nodes with generator render function', async () => {
    const ui = render({
      model: 'gpt-3.5-turbo',
      messages: [],
      provider: createMockUpProvider(),
      functions: {
        get_current_weather: {
          description: 'Get the current weather',
          parameters: z.object({}),
          render: async function* () {
            yield <div>Loading...</div>;
            await new Promise(resolve => setTimeout(resolve, 100));
            return <div>Weather</div>;
          },
        },
      },
    });

    const rendered = await simulateFlightServerRender(ui as any);
    expect(rendered).toMatchSnapshot();
  });
});
