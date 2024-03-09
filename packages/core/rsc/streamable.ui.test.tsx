import {
  openaiChatCompletionChunks,
  openaiFunctionCallChunks,
} from '../tests/snapshots/openai-chat';
import { DEFAULT_TEST_URL, createMockServer } from '../tests/utils/mock-server';
import { readStreamableValue } from './shared-client';
import {
  createStreamableUI,
  createStreamableValue,
  render,
} from './streamable';
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

function nextTick() {
  return Promise.resolve();
}

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

function getFinalValueFromResolved(node: any) {
  if (!node) return node;
  if (node.type === 'Symbol(react.suspense)') {
    return getFinalValueFromResolved(node.children);
  } else if (node.type === 'Row') {
    let value = node.props.value;
    let next = node.props.next;
    while (next) {
      value = next.value;
      next = next.next;
    }
    return getFinalValueFromResolved(value);
  }
  return node;
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

describe('rsc - render()', () => {
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

describe('rsc - createStreamableUI()', () => {
  it('should emit React Nodes that can be updated', async () => {
    const ui = createStreamableUI(<div>1</div>);
    ui.update(<div>2</div>);
    ui.update(<div>3</div>);
    ui.done();

    const final = getFinalValueFromResolved(
      await simulateFlightServerRender(ui.value),
    );
    expect(final).toMatchInlineSnapshot(`
      <div>
        3
      </div>
    `);
  });

  it('should emit React Nodes that can be updated with .done()', async () => {
    const ui = createStreamableUI(<div>1</div>);
    ui.update(<div>2</div>);
    ui.update(<div>3</div>);
    ui.done(<div>4</div>);

    const final = getFinalValueFromResolved(
      await simulateFlightServerRender(ui.value),
    );
    expect(final).toMatchInlineSnapshot(`
      <div>
        4
      </div>
    `);
  });

  it('should support .append()', async () => {
    const ui = createStreamableUI(<div>1</div>);
    ui.update(<div>2</div>);
    ui.append(<div>3</div>);
    ui.append(<div>4</div>);
    ui.done();

    const final = getFinalValueFromResolved(
      await simulateFlightServerRender(ui.value),
    );
    expect(final).toMatchInlineSnapshot(`
      <React.Fragment>
        <React.Fragment>
          <div>
            2
          </div>
          <div>
            3
          </div>
        </React.Fragment>
        <div>
          4
        </div>
      </React.Fragment>
    `);
  });

  it('should support streaming .append() result before .done()', async () => {
    const ui = createStreamableUI(<div>1</div>);
    ui.append(<div>2</div>);
    ui.append(<div>3</div>);

    const currentRsolved = ui.value.props.children.props.next;
    const tryResolve1 = await Promise.race([currentRsolved, nextTick()]);
    expect(tryResolve1).toBeDefined();
    const tryResolve2 = await Promise.race([tryResolve1.next, nextTick()]);
    expect(tryResolve2).toBeDefined();
    expect(getFinalValueFromResolved(tryResolve2.value)).toMatchInlineSnapshot(`
      <React.Fragment>
        <React.Fragment>
          <div>
            1
          </div>
          <div>
            2
          </div>
        </React.Fragment>
        <div>
          3
        </div>
      </React.Fragment>
    `);

    ui.append(<div>4</div>);
    ui.done();

    const final = getFinalValueFromResolved(
      await simulateFlightServerRender(ui.value),
    );
    expect(final).toMatchInlineSnapshot(`
      <React.Fragment>
        <React.Fragment>
          <React.Fragment>
            <div>
              1
            </div>
            <div>
              2
            </div>
          </React.Fragment>
          <div>
            3
          </div>
        </React.Fragment>
        <div>
          4
        </div>
      </React.Fragment>
    `);
  });

  it('should support updating appended ui', async () => {
    const ui = createStreamableUI(<div>1</div>);
    ui.update(<div>2</div>);
    ui.append(<div>3</div>);
    ui.done(<div>4</div>);

    const final = getFinalValueFromResolved(
      await simulateFlightServerRender(ui.value),
    );
    expect(final).toMatchInlineSnapshot(`
      <div>
        4
      </div>
    `);
  });

  it('should re-use the text node when appending strings', async () => {
    const ui = createStreamableUI('hello');
    ui.append(' world');
    ui.append('!');
    ui.done();

    const final = getFinalValueFromResolved(
      await simulateFlightServerRender(ui.value),
    );
    expect(final).toMatchInlineSnapshot('"hello world!"');
  });

  it('should error when updating a closed streamable', async () => {
    const ui = createStreamableUI(<div>1</div>);
    ui.done(<div>2</div>);

    expect(() => {
      ui.update(<div>3</div>);
    }).toThrowErrorMatchingInlineSnapshot(
      '".update(): UI stream is already closed."',
    );
  });
});

describe('rsc - createStreamableValue()', () => {
  it('should directly emit the final value when reading .value', async () => {
    const streamable = createStreamableValue('1');
    streamable.update('2');
    streamable.update('3');

    expect(streamable.value).toMatchInlineSnapshot(`
      {
        "curr": "3",
        "next": Promise {},
        "type": Symbol(ui.streamable.value),
      }
    `);

    streamable.done('4');

    expect(streamable.value).toMatchInlineSnapshot(`
      {
        "curr": "4",
        "type": Symbol(ui.streamable.value),
      }
    `);
  });

  it('should be able to stream any JSON values', async () => {
    const streamable = createStreamableValue();
    streamable.update({ v: 123 });

    expect(streamable.value).toMatchInlineSnapshot(`
      {
        "curr": {
          "v": 123,
        },
        "next": Promise {},
        "type": Symbol(ui.streamable.value),
      }
    `);

    streamable.done();
  });

  it('should support .error()', async () => {
    const streamable = createStreamableValue();
    streamable.error('This is an error');

    expect(streamable.value).toMatchInlineSnapshot(`
      {
        "error": "This is an error",
        "type": Symbol(ui.streamable.value),
      }
    `);
  });

  it('should support reading streamed values and errors', async () => {
    const streamable = createStreamableValue(1);
    (async () => {
      await nextTick();
      streamable.update(2);
      await nextTick();
      streamable.update(3);
      await nextTick();
      streamable.error('This is an error');
    })();

    const values = [];

    try {
      for await (const v of readStreamableValue(streamable.value)) {
        values.push(v);
      }
    } catch (e) {
      expect(e).toMatchInlineSnapshot(`"This is an error"`);
    }

    expect(values).toMatchInlineSnapshot(`
      [
        1,
        2,
        3,
      ]
    `);
  });
});
