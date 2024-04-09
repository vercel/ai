import ReactDOMServer from 'react-dom/server';
import {
  OpenAIStream,
  ReactResponseRow,
  StreamData,
  experimental_StreamingReactResponse,
} from '.';
import {
  openaiChatCompletionChunks,
  openaiFunctionCallChunks,
} from '../tests/snapshots/openai-chat';
import { DEFAULT_TEST_URL, createMockServer } from '../tests/utils/mock-server';

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

async function extractReactRowContents(response: Promise<ReactResponseRow>) {
  let current: ReactResponseRow | null = await response;
  const rows: {
    ui: string | JSX.Element | JSX.Element[] | null | undefined;
    content: string;
  }[] = [];

  while (current != null) {
    let ui = await current.ui;

    if (ui != null && typeof ui !== 'string' && !Array.isArray(ui)) {
      ui = ReactDOMServer.renderToStaticMarkup(ui);
    }

    rows.push({
      ui: ui,
      content: current.content,
    });
    current = await current.next;
  }

  return rows;
}

describe('without ui', () => {
  it('should stream text response as React rows', async () => {
    const stream = OpenAIStream(await fetch(DEFAULT_TEST_URL));

    const response = new experimental_StreamingReactResponse(
      stream,
      {},
    ) as Promise<ReactResponseRow>;

    const rows = await extractReactRowContents(response);

    expect(rows).toEqual([
      { ui: 'Hello', content: 'Hello' },
      { ui: 'Hello,', content: 'Hello,' },
      { ui: 'Hello, world', content: 'Hello, world' },
      { ui: 'Hello, world.', content: 'Hello, world.' },
      { ui: 'Hello, world.', content: 'Hello, world.' },
    ]);
  });

  it('should stream text response as React rows from data stream', async () => {
    const data = new StreamData();

    const stream = OpenAIStream(await fetch(DEFAULT_TEST_URL), {
      onFinal() {
        data.close();
      },
    });

    const response = new experimental_StreamingReactResponse(stream, {
      data,
    }) as Promise<ReactResponseRow>;

    const rows = await extractReactRowContents(response);

    expect(rows).toEqual([
      { ui: 'Hello', content: 'Hello' },
      { ui: 'Hello,', content: 'Hello,' },
      { ui: 'Hello, world', content: 'Hello, world' },
      { ui: 'Hello, world.', content: 'Hello, world.' },
      { ui: 'Hello, world.', content: 'Hello, world.' },
    ]);
  });
});

describe('with ui: sync jsx for content', () => {
  it('should stream React response as React rows', async () => {
    const stream = OpenAIStream(await fetch(DEFAULT_TEST_URL));
    const response = new experimental_StreamingReactResponse(stream, {
      ui: ({ content }) => <span>{content}</span>,
    }) as Promise<ReactResponseRow>;

    const rows = await extractReactRowContents(response);

    expect(rows).toEqual([
      { ui: '<span>Hello</span>', content: 'Hello' },
      { ui: '<span>Hello,</span>', content: 'Hello,' },
      { ui: '<span>Hello, world</span>', content: 'Hello, world' },
      { ui: '<span>Hello, world.</span>', content: 'Hello, world.' },
      { ui: '<span>Hello, world.</span>', content: 'Hello, world.' },
    ]);
  });

  it('should stream React response as React rows from data stream', async () => {
    const data = new StreamData();

    const stream = OpenAIStream(await fetch(DEFAULT_TEST_URL), {
      onFinal() {
        data.close();
      },
    });

    const response = new experimental_StreamingReactResponse(stream, {
      data,
      ui: ({ content }) => <span>{content}</span>,
    }) as Promise<ReactResponseRow>;

    const rows = await extractReactRowContents(response);

    expect(rows).toEqual([
      { ui: '<span>Hello</span>', content: 'Hello' },
      { ui: '<span>Hello,</span>', content: 'Hello,' },
      { ui: '<span>Hello, world</span>', content: 'Hello, world' },
      { ui: '<span>Hello, world.</span>', content: 'Hello, world.' },
      { ui: '<span>Hello, world.</span>', content: 'Hello, world.' },
    ]);
  });
});

describe('with ui: async sync jsx for content', () => {
  it('should stream React response as React rows', async () => {
    const stream = OpenAIStream(await fetch(DEFAULT_TEST_URL));
    const response = new experimental_StreamingReactResponse(stream, {
      ui: async ({ content }) => Promise.resolve(<span>{content}</span>),
    }) as Promise<ReactResponseRow>;

    const rows = await extractReactRowContents(response);

    expect(rows).toEqual([
      { ui: '<span>Hello</span>', content: 'Hello' },
      { ui: '<span>Hello,</span>', content: 'Hello,' },
      { ui: '<span>Hello, world</span>', content: 'Hello, world' },
      { ui: '<span>Hello, world.</span>', content: 'Hello, world.' },
      { ui: '<span>Hello, world.</span>', content: 'Hello, world.' },
    ]);
  });

  it('should stream React response as React rows from data stream', async () => {
    const data = new StreamData();

    const stream = OpenAIStream(await fetch(DEFAULT_TEST_URL), {
      onFinal() {
        data.close();
      },
    });

    const response = new experimental_StreamingReactResponse(stream, {
      data,
      ui: async ({ content }) => Promise.resolve(<span>{content}</span>),
    }) as Promise<ReactResponseRow>;

    const rows = await extractReactRowContents(response);

    expect(rows).toEqual([
      { ui: '<span>Hello</span>', content: 'Hello' },
      { ui: '<span>Hello,</span>', content: 'Hello,' },
      { ui: '<span>Hello, world</span>', content: 'Hello, world' },
      { ui: '<span>Hello, world.</span>', content: 'Hello, world.' },
      { ui: '<span>Hello, world.</span>', content: 'Hello, world.' },
    ]);
  });
});

describe('with ui: sync jsx for content and data', () => {
  it('should stream React response as React rows from data stream when data is appended', async () => {
    const data = new StreamData();

    const stream = OpenAIStream(await fetch(FUNCTION_CALL_TEST_URL), {
      onFinal() {
        data.close();
      },
      async experimental_onFunctionCall({ name }) {
        data.append({ fn: name });
        return undefined;
      },
    });

    const response = new experimental_StreamingReactResponse(stream, {
      data,
      ui: ({ content, data }) => {
        if (data != null) {
          return <pre>{JSON.stringify(data)}</pre>;
        }

        return <span>{content}</span>;
      },
    }) as Promise<ReactResponseRow>;

    const rows = await extractReactRowContents(response);

    expect(rows).toStrictEqual([
      {
        ui: '<pre>[{&quot;fn&quot;:&quot;get_current_weather&quot;}]</pre>',
        content: '',
      },
      {
        ui: '<pre>[{&quot;fn&quot;:&quot;get_current_weather&quot;}]</pre>',
        content: '',
      },
      {
        ui: '<pre>[{&quot;fn&quot;:&quot;get_current_weather&quot;}]</pre>',
        content: '',
      },
    ]);
  });
});

describe('with ui: async jsx for content and data', () => {
  it('should stream React response as React rows from data stream when data is appended', async () => {
    const data = new StreamData();

    const stream = OpenAIStream(await fetch(FUNCTION_CALL_TEST_URL), {
      onFinal() {
        data.close();
      },
      async experimental_onFunctionCall({ name }) {
        data.append({ fn: name });
        return undefined;
      },
    });

    const response = new experimental_StreamingReactResponse(stream, {
      data,
      ui: async ({ content, data }) => {
        if (data != null) {
          return Promise.resolve(<pre>{JSON.stringify(data)}</pre>);
        }

        return Promise.resolve(<span>{content}</span>);
      },
    }) as Promise<ReactResponseRow>;

    const rows = await extractReactRowContents(response);

    expect(rows).toStrictEqual([
      {
        ui: '<pre>[{&quot;fn&quot;:&quot;get_current_weather&quot;}]</pre>',
        content: '',
      },
      {
        ui: '<pre>[{&quot;fn&quot;:&quot;get_current_weather&quot;}]</pre>',
        content: '',
      },
      {
        ui: '<pre>[{&quot;fn&quot;:&quot;get_current_weather&quot;}]</pre>',
        content: '',
      },
    ]);
  });
});
