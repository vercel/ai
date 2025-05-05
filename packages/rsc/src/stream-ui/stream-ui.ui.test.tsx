import { delay } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { MockLanguageModelV2 } from 'ai/test';
import { streamUI } from './stream-ui';
import { z } from 'zod';
import { LanguageModelUsage } from 'ai';

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
  async function traverse(node: any): Promise<any> {
    if (!node) return {};

    // Let's only do one level of promise resolution here. As it's only for testing purposes.
    const props = await recursiveResolve({ ...node.props });

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

const testUsage: LanguageModelUsage = {
  inputTokens: 3,
  outputTokens: 10,
  totalTokens: 13,
};

const mockTextModel = new MockLanguageModelV2({
  doStream: async () => {
    return {
      stream: convertArrayToReadableStream([
        { type: 'text', text: '{ ' },
        { type: 'text', text: '"content": ' },
        { type: 'text', text: `"Hello, ` },
        { type: 'text', text: `world` },
        { type: 'text', text: `!"` },
        { type: 'text', text: ' }' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: testUsage,
        },
      ]),
    };
  },
});

const mockToolModel = new MockLanguageModelV2({
  doStream: async () => {
    return {
      stream: convertArrayToReadableStream([
        {
          type: 'tool-call',
          toolCallType: 'function',
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: `{ "value": "value" }`,
        },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: testUsage,
        },
      ]),
    };
  },
});

describe('result.value', () => {
  it('should render text', async () => {
    const result = await streamUI({
      model: mockTextModel,
      prompt: '',
    });

    const rendered = await simulateFlightServerRender(result.value);
    expect(rendered).toMatchSnapshot();
  });

  it('should render text function returned ui', async () => {
    const result = await streamUI({
      model: mockTextModel,
      prompt: '',
      text: ({ content }) => <h1>{content}</h1>,
    });

    const rendered = await simulateFlightServerRender(result.value);
    expect(rendered).toMatchSnapshot();
  });

  it('should render tool call results', async () => {
    const result = await streamUI({
      model: mockToolModel,
      prompt: '',
      tools: {
        tool1: {
          description: 'test tool 1',
          parameters: z.object({
            value: z.string(),
          }),
          generate: async ({ value }) => {
            await delay(100);
            return <div>tool1: {value}</div>;
          },
        },
      },
    });

    const rendered = await simulateFlightServerRender(result.value);
    expect(rendered).toMatchSnapshot();
  });

  it('should render tool call results with generator render function', async () => {
    const result = await streamUI({
      model: mockToolModel,
      prompt: '',
      tools: {
        tool1: {
          description: 'test tool 1',
          parameters: z.object({
            value: z.string(),
          }),
          generate: async function* ({ value }) {
            yield <div>Loading...</div>;
            await delay(100);
            return <div>tool: {value}</div>;
          },
        },
      },
    });

    const rendered = await simulateFlightServerRender(result.value);
    expect(rendered).toMatchSnapshot();
  });

  it('should show better error messages if legacy options are passed', async () => {
    try {
      await streamUI({
        model: mockToolModel,
        prompt: '',
        tools: {
          tool1: {
            description: 'test tool 1',
            parameters: z.object({
              value: z.string(),
            }),
            // @ts-expect-error
            render: async function* () {},
          },
        },
      });
    } catch (e) {
      expect(e).toMatchSnapshot();
    }
  });
});

describe('rsc - streamUI() onFinish callback', () => {
  let result: Parameters<
    Required<Parameters<typeof streamUI>[0]>['onFinish']
  >[0];

  beforeEach(async () => {
    const ui = await streamUI({
      model: mockToolModel,
      prompt: '',
      tools: {
        tool1: {
          description: 'test tool 1',
          parameters: z.object({
            value: z.string(),
          }),
          generate: async ({ value }) => {
            await delay(100);
            return <div>tool1: {value}</div>;
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
    expect(result.usage).toStrictEqual(testUsage);
  });

  it('should contain finish reason', async () => {
    expect(result.finishReason).toBe('stop');
  });

  it('should contain final React node', async () => {
    expect(result.value).toMatchSnapshot();
  });
});

describe('options.headers', () => {
  it('should pass headers to model', async () => {
    const result = await streamUI({
      model: new MockLanguageModelV2({
        doStream: async ({ headers }) => {
          expect(headers).toStrictEqual({
            'custom-request-header': 'request-header-value',
          });

          return {
            stream: convertArrayToReadableStream([
              {
                type: 'text',
                text: '{ "content": "headers test" }',
              },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
              },
            ]),
          };
        },
      }),
      prompt: '',
      headers: { 'custom-request-header': 'request-header-value' },
    });

    expect(await simulateFlightServerRender(result.value)).toMatchSnapshot();
  });
});

describe('options.providerMetadata', () => {
  it('should pass provider metadata to model', async () => {
    const result = await streamUI({
      model: new MockLanguageModelV2({
        doStream: async ({ providerOptions }) => {
          expect(providerOptions).toStrictEqual({
            aProvider: { someKey: 'someValue' },
          });

          return {
            stream: convertArrayToReadableStream([
              {
                type: 'text',
                text: '{ "content": "provider metadata test" }',
              },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
              },
            ]),
          };
        },
      }),
      prompt: '',
      providerOptions: {
        aProvider: { someKey: 'someValue' },
      },
    });

    expect(await simulateFlightServerRender(result.value)).toMatchSnapshot();
  });
});
