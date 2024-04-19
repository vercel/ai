import {
  openaiChatCompletionChunks,
  openaiFunctionCallChunks,
} from '../tests/snapshots/openai-chat';
import { DEFAULT_TEST_URL, createMockServer } from '../tests/utils/mock-server';
import { createStreamableUI, render } from './streamable';
import { z } from 'zod';

const FUNCTION_CALL_TEST_URL = DEFAULT_TEST_URL + 'mock-func-call';

// This is a workaround to render the Flight response in a test environment.
async function flightRender(node: React.ReactNode, byChunk?: boolean) {
  const ReactDOM = require('react-dom');
  ReactDOM.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactDOMCurrentDispatcher =
    { current: {} };

  const React = require('react');
  React.__SECRET_SERVER_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
    ReactSharedServerInternals: {},
    ReactCurrentCache: {
      current: null,
    },
  };

  const {
    renderToReadableStream,
  } = require('react-server-dom-webpack/server.edge');

  const stream = renderToReadableStream(node);
  const reader = stream.getReader();

  const chunks = [];
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const decoded = new TextDecoder().decode(value);
    if (byChunk) {
      chunks.push(decoded);
    } else {
      result += decoded;
    }
  }

  return byChunk ? chunks : result;
}

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
  } else if (node.type === '') {
    let wrapper;
    let value = node.props.value;
    let next = node.props.n;
    let current = node.props.c;

    while (next) {
      if (next.append) {
        if (wrapper === undefined) {
          wrapper = current;
        } else if (typeof current === 'string' && typeof wrapper === 'string') {
          wrapper = wrapper + current;
        } else {
          wrapper = (
            <>
              {wrapper}
              {current}
            </>
          );
        }
      }

      value = next.value;
      next = next.next;
      current = value;
    }

    return getFinalValueFromResolved(
      wrapper === undefined ? (
        value
      ) : typeof value === 'string' && typeof wrapper === 'string' ? (
        wrapper + value
      ) : (
        <>
          {wrapper}
          {value}
        </>
      ),
    );
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

    const currentRsolved = ui.value.props.children.props.n;
    const tryResolve1 = await Promise.race([currentRsolved, nextTick()]);
    expect(tryResolve1).toBeDefined();
    const tryResolve2 = await Promise.race([tryResolve1.next, nextTick()]);
    expect(tryResolve2).toBeDefined();
    expect(getFinalValueFromResolved(tryResolve2.value)).toMatchInlineSnapshot(`
      <div>
        3
      </div>
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

  it('should support updating the appended ui', async () => {
    const ui = createStreamableUI(<div>1</div>);
    ui.update(<div>2</div>);
    ui.append(<div>3</div>);
    ui.done(<div>4</div>);

    const final = getFinalValueFromResolved(
      await simulateFlightServerRender(ui.value),
    );
    expect(final).toMatchInlineSnapshot(`
      <React.Fragment>
        <div>
          2
        </div>
        <div>
          4
        </div>
      </React.Fragment>
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

  it('should send minimal incremental diffs when appending strings', async () => {
    const ui = createStreamableUI('hello');
    ui.append(' world');
    ui.append(' and');
    ui.append(' universe');
    ui.done();

    expect(await flightRender(ui.value)).toMatchInlineSnapshot(`
      "1:\\"$Sreact.suspense\\"
      2:D{\\"name\\":\\"\\",\\"env\\":\\"Server\\"}
      0:[\\"$\\",\\"$1\\",null,{\\"fallback\\":\\"hello\\",\\"children\\":\\"$L2\\"}]
      3:D{\\"name\\":\\"\\",\\"env\\":\\"Server\\"}
      2:[\\"hello\\",[\\"$\\",\\"$1\\",null,{\\"fallback\\":\\" world\\",\\"children\\":\\"$L3\\"}]]
      4:D{\\"name\\":\\"\\",\\"env\\":\\"Server\\"}
      3:[\\" world\\",[\\"$\\",\\"$1\\",null,{\\"fallback\\":\\" and\\",\\"children\\":\\"$L4\\"}]]
      5:D{\\"name\\":\\"\\",\\"env\\":\\"Server\\"}
      4:[\\" and\\",[\\"$\\",\\"$1\\",null,{\\"fallback\\":\\" universe\\",\\"children\\":\\"$L5\\"}]]
      5:\\" universe\\"
      "
    `);

    const final = getFinalValueFromResolved(
      await simulateFlightServerRender(ui.value),
    );
    expect(final).toMatchInlineSnapshot('"hello world and universe"');
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

  it('should avoid sending data again if the same UI is passed', async () => {
    const node = <div>1</div>;
    const ui = createStreamableUI(node);
    ui.update(node);
    ui.update(node);
    ui.update(node);
    ui.update(node);
    ui.update(node);
    ui.update(node);
    ui.done();

    expect(await flightRender(ui.value)).toMatchInlineSnapshot(`
      "1:\\"$Sreact.suspense\\"
      2:D{\\"name\\":\\"\\",\\"env\\":\\"Server\\"}
      0:[\\"$\\",\\"$1\\",null,{\\"fallback\\":[\\"$\\",\\"div\\",null,{\\"children\\":\\"1\\"}],\\"children\\":\\"$L2\\"}]
      4:{\\"children\\":\\"1\\"}
      3:[\\"$\\",\\"div\\",null,\\"$4\\"]
      2:\\"$3\\"
      "
    `);
  });
});
