import { convertArrayToReadableStream } from '../../core/test/convert-array-to-readable-stream';
import { MockLanguageModelV1 } from '../../core/test/mock-language-model-v1';
import { streamUI } from './stream-ui';
import { z } from 'zod';

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

const mockTextModel = new MockLanguageModelV1({
  doStream: async () => {
    return {
      stream: convertArrayToReadableStream([
        { type: 'text-delta', textDelta: '{ ' },
        { type: 'text-delta', textDelta: '"content": ' },
        { type: 'text-delta', textDelta: `"Hello, ` },
        { type: 'text-delta', textDelta: `world` },
        { type: 'text-delta', textDelta: `!"` },
        { type: 'text-delta', textDelta: ' }' },
      ]),
      rawCall: { rawPrompt: 'prompt', rawSettings: {} },
    };
  },
});

const mockToolModel = new MockLanguageModelV1({
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
      ]),
      rawCall: { rawPrompt: 'prompt', rawSettings: {} },
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
            await new Promise(resolve => setTimeout(resolve, 100));
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
            await new Promise(resolve => setTimeout(resolve, 100));
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
