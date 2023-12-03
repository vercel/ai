import React from 'react';
import OpenAI from 'openai';
import ReactDOMServer from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, test, vi } from 'vitest';
import {
  CreateMessage,
  OpenAIStream,
  ReactResponseRow,
  StreamingTextResponse,
  experimental_StreamData,
  experimental_StreamingReactResponse,
} from '.';
import { createClient } from '../tests/utils/mock-client';
import { setup } from '../tests/utils/mock-service';

describe('OpenAIStream', () => {
  let server: ReturnType<typeof setup>;
  beforeAll(() => {
    server = setup();
  });
  afterAll(async () => server.teardown());

  // deactivated to only test types
  test.skip('should not throw type errors', async () => {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo-16k',
      stream: true,
      temperature: 0.0,
      messages: [
        { role: 'system', content: 'You are a helpful yada yada' },
        { role: 'user', content: '' },
      ],
    });

    const stream = OpenAIStream(response);
  });

  it('should be able to parse SSE and receive the streamed response', async () => {
    const stream = OpenAIStream(
      await fetch(server.api, {
        headers: {
          'x-mock-service': 'openai',
          'x-mock-type': 'chat',
        },
      }),
    );
    const response = new StreamingTextResponse(stream);
    const client = createClient(response);
    const chunks = await client.readAll();
    expect(JSON.stringify(chunks)).toMatchInlineSnapshot(
      `"[\\"Hello\\",\\",\\",\\" world\\",\\".\\"]"`,
    );
    expect(JSON.stringify(server.getRecentFlushed())).toMatchInlineSnapshot(
      `"[{\\"id\\":\\"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC\\",\\"object\\":\\"chat.completion.chunk\\",\\"created\\":1686901302,\\"model\\":\\"gpt-3.5-turbo-0301\\",\\"choices\\":[{\\"delta\\":{\\"role\\":\\"assistant\\"},\\"index\\":0,\\"finish_reason\\":null}]},{\\"id\\":\\"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC\\",\\"object\\":\\"chat.completion.chunk\\",\\"created\\":1686901302,\\"model\\":\\"gpt-3.5-turbo-0301\\",\\"choices\\":[{\\"delta\\":{\\"content\\":\\"Hello\\"},\\"index\\":0,\\"finish_reason\\":null}]},{\\"id\\":\\"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC\\",\\"object\\":\\"chat.completion.chunk\\",\\"created\\":1686901302,\\"model\\":\\"gpt-3.5-turbo-0301\\",\\"choices\\":[{\\"delta\\":{\\"content\\":\\",\\"},\\"index\\":0,\\"finish_reason\\":null}]},{\\"id\\":\\"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC\\",\\"object\\":\\"chat.completion.chunk\\",\\"created\\":1686901302,\\"model\\":\\"gpt-3.5-turbo-0301\\",\\"choices\\":[{\\"delta\\":{\\"content\\":\\" world\\"},\\"index\\":0,\\"finish_reason\\":null}]},{\\"id\\":\\"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC\\",\\"object\\":\\"chat.completion.chunk\\",\\"created\\":1686901302,\\"model\\":\\"gpt-3.5-turbo-0301\\",\\"choices\\":[{\\"delta\\":{\\"content\\":\\".\\"},\\"index\\":0,\\"finish_reason\\":null}]},{\\"id\\":\\"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC\\",\\"object\\":\\"chat.completion.chunk\\",\\"created\\":1686901302,\\"model\\":\\"gpt-3.5-turbo-0301\\",\\"choices\\":[{\\"delta\\":{},\\"index\\":0,\\"finish_reason\\":\\"stop\\"}]}]"`,
    );
  });

  it('should correctly parse and escape function call JSON chunks', async () => {
    const stream = OpenAIStream(
      await fetch(server.api + '/mock-func-call', {
        headers: {
          'x-mock-service': 'openai',
          'x-mock-type': 'func_call',
        },
      }),
    );
    const response = new StreamingTextResponse(stream);
    const client = createClient(response);
    const chunks = await client.readAll();

    const expectedChunks = [
      '{"function_call": {"name": "get_current_weather", "arguments": "',
      '{\\n',
      '\\"',
      'location',
      '\\":',
      ' \\"',
      'Char',
      'l',
      'ottesville',
      ',',
      ' Virginia',
      '\\",\\n',
      '\\"',
      'format',
      '\\":',
      ' \\"',
      'c',
      'elsius',
      '\\"\\n',
      '}',
      '"}}',
    ];

    expect(chunks).toEqual(expectedChunks);
    expect(chunks.join('')).toEqual(
      `{"function_call": {"name": "get_current_weather", "arguments": "{\\n\\"location\\": \\"Charlottesville, Virginia\\",\\n\\"format\\": \\"celsius\\"\\n}"}}`,
    );
  });

  it('should handle backpressure on the server', async () => {
    const controller = new AbortController();
    const stream = OpenAIStream(
      await fetch(server.api, {
        headers: {
          'x-mock-service': 'openai',
          'x-mock-type': 'chat',
        },
        signal: controller.signal,
      }),
    );
    const response = new StreamingTextResponse(stream);
    const client = createClient(response);
    const chunks = await client.readAndAbort(controller);
    expect(JSON.stringify(chunks)).toMatchInlineSnapshot(`"[\\"Hello\\"]"`);
    expect(JSON.stringify(server.getRecentFlushed())).toMatchInlineSnapshot(
      `"[{\\"id\\":\\"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC\\",\\"object\\":\\"chat.completion.chunk\\",\\"created\\":1686901302,\\"model\\":\\"gpt-3.5-turbo-0301\\",\\"choices\\":[{\\"delta\\":{\\"role\\":\\"assistant\\"},\\"index\\":0,\\"finish_reason\\":null}]},{\\"id\\":\\"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC\\",\\"object\\":\\"chat.completion.chunk\\",\\"created\\":1686901302,\\"model\\":\\"gpt-3.5-turbo-0301\\",\\"choices\\":[{\\"delta\\":{\\"content\\":\\"Hello\\"},\\"index\\":0,\\"finish_reason\\":null}]}]"`,
    );
  });

  describe('StreamData prototcol', () => {
    it('should send text', async () => {
      const data = new experimental_StreamData();

      const stream = OpenAIStream(
        await fetch(server.api, {
          headers: {
            'x-mock-service': 'openai',
            'x-mock-type': 'chat',
          },
        }),
        {
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
        },
      );

      const response = new StreamingTextResponse(stream, {}, data);

      const client = createClient(response);
      const chunks = await client.readAll();

      expect(chunks).toEqual([
        '0:"Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ]);
    });

    it('should send function response as text stream when onFunctionCall is not defined', async () => {
      const data = new experimental_StreamData();

      const stream = OpenAIStream(
        await fetch(server.api + '/mock-func-call', {
          headers: {
            'x-mock-service': 'openai',
            'x-mock-type': 'func_call',
          },
        }),
        {
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
        },
      );

      const response = new StreamingTextResponse(stream, {}, data);

      const client = createClient(response);
      const chunks = await client.readAll();

      expect(chunks).toEqual([
        '0:"{\\"function_call\\": {\\"name\\": \\"get_current_weather\\", \\"arguments\\": \\""\n',
        '0:"{\\\\n"\n',
        '0:"\\\\\\""\n',
        '0:"location"\n',
        '0:"\\\\\\":"\n',
        '0:" \\\\\\""\n',
        '0:"Char"\n',
        '0:"l"\n',
        '0:"ottesville"\n',
        '0:","\n',
        '0:" Virginia"\n',
        '0:"\\\\\\",\\\\n"\n',
        '0:"\\\\\\""\n',
        '0:"format"\n',
        '0:"\\\\\\":"\n',
        '0:" \\\\\\""\n',
        '0:"c"\n',
        '0:"elsius"\n',
        '0:"\\\\\\"\\\\n"\n',
        '0:"}"\n',
        '0:"\\"}}"\n',
      ]);
    });

    it('should send function response when onFunctionCall is defined and returns undefined', async () => {
      const data = new experimental_StreamData();

      const stream = OpenAIStream(
        await fetch(server.api + '/mock-func-call', {
          headers: {
            'x-mock-service': 'openai',
            'x-mock-type': 'func_call',
          },
        }),
        {
          onFinal() {
            data.close();
          },
          async experimental_onFunctionCall({ name }) {
            // no response
          },
          experimental_streamData: true,
        },
      );

      const response = new StreamingTextResponse(stream, {}, data);

      const client = createClient(response);
      const chunks = await client.readAll();

      expect(chunks).toEqual([
        '1:{"function_call":{"name":"get_current_weather","arguments":"{\\n\\"location\\": \\"Charlottesville, Virginia\\",\\n\\"format\\": \\"celsius\\"\\n}"}}\n',
      ]);
    });

    it('should send function response and data when onFunctionCall is defined, returns undefined, and data is added', async () => {
      const data = new experimental_StreamData();

      const stream = OpenAIStream(
        await fetch(server.api + '/mock-func-call', {
          headers: {
            'x-mock-service': 'openai',
            'x-mock-type': 'func_call',
          },
        }),
        {
          onFinal() {
            data.close();
          },
          async experimental_onFunctionCall({ name }) {
            data.append({ fn: name });

            // no response
          },
          experimental_streamData: true,
        },
      );

      const response = new StreamingTextResponse(stream, {}, data);

      const client = createClient(response);
      const chunks = await client.readAll();

      expect(chunks).toEqual([
        '2:[{"fn":"get_current_weather"}]\n',
        '1:{"function_call":{"name":"get_current_weather","arguments":"{\\n\\"location\\": \\"Charlottesville, Virginia\\",\\n\\"format\\": \\"celsius\\"\\n}"}}\n',
      ]);
    });

    it('should send return value when onFunctionCall is defined and returns value', async () => {
      const data = new experimental_StreamData();

      const stream = OpenAIStream(
        await fetch(server.api + '/mock-func-call', {
          headers: {
            'x-mock-service': 'openai',
            'x-mock-type': 'func_call',
          },
        }),
        {
          onFinal() {
            data.close();
          },
          async experimental_onFunctionCall({ name }) {
            return 'experimental_onFunctionCall-return-value';
          },
          experimental_streamData: true,
        },
      );

      const response = new StreamingTextResponse(stream, {}, data);

      const client = createClient(response);
      const chunks = await client.readAll();

      expect(chunks).toEqual([
        '0:"experimental_onFunctionCall-return-value"\n',
      ]);
    });

    it('should send return value and data when onFunctionCall is defined, returns value and data is added', async () => {
      const data = new experimental_StreamData();

      const stream = OpenAIStream(
        await fetch(server.api + '/mock-func-call', {
          headers: {
            'x-mock-service': 'openai',
            'x-mock-type': 'func_call',
          },
        }),
        {
          onFinal() {
            data.close();
          },
          async experimental_onFunctionCall({ name }) {
            data.append({ fn: name });
            return 'experimental_onFunctionCall-return-value';
          },
          experimental_streamData: true,
        },
      );

      const response = new StreamingTextResponse(stream, {}, data);

      const client = createClient(response);
      const chunks = await client.readAll();

      expect(chunks).toEqual([
        '2:[{"fn":"get_current_weather"}]\n',
        '0:"experimental_onFunctionCall-return-value"\n',
      ]);
    });

    it('should send text and data', async () => {
      const data = new experimental_StreamData();

      data.append({ t1: 'v1' });

      const stream = OpenAIStream(
        await fetch(server.api, {
          headers: {
            'x-mock-service': 'openai',
            'x-mock-type': 'chat',
          },
        }),
        {
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
        },
      );

      const response = new StreamingTextResponse(stream, {}, data);

      const client = createClient(response);
      const chunks = await client.readAll();

      expect(chunks).toEqual([
        '2:[{"t1":"v1"}]\n',
        '0:"Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ]);
    });

    it('should return the tool calls to the client if the server doesnt provide a response', async () => {
      const dateTimeCallback = vi.fn();
      const openWebpageCallback = vi.fn();

      const stream = OpenAIStream(
        await fetch(server.api + '/mock-tool-call', {
          headers: {
            'x-mock-service': 'openai',
            'x-mock-type': 'tool_call',
          },
        }),
        {
          async experimental_onToolCall(toolCallPayload) {
            const { tools } = toolCallPayload;
            for (const { id, func } of tools) {
              if (func.name === 'get_date_time') {
                dateTimeCallback({
                  tool_call_id: id,
                });
              }
              if (func.name === 'open_webpage') {
                openWebpageCallback({
                  tool_call_id: id,
                });
              }
            }
          },
          experimental_streamData: true,
        },
      );

      const response = new StreamingTextResponse(stream, {});

      const client = createClient(response);
      const chunks = await client.readAll();

      expect(dateTimeCallback).toHaveBeenCalledWith({
        tool_call_id: 'call_NPkY32jNUOb3Kkm7v9cOgmVg',
      });
      expect(openWebpageCallback).toHaveBeenCalledWith({
        tool_call_id: 'call_pOyOtXFQltSjUGsF7gnLAEcD',
      });
      expect(chunks).toEqual([
        '6:{"tool_calls":[{"id":"call_NPkY32jNUOb3Kkm7v9cOgmVg","type":"function","function":{"name":"get_date_time","arguments":{}}},{"id":"call_pOyOtXFQltSjUGsF7gnLAEcD","type":"function","function":{"name":"open_webpage","arguments":{"url":"https://www.linkedin.com/in/jessepascoe"}}}]}\n',
      ]);
    });

    it('should call multiple tools when stream indicates multiple tool calls', async () => {
      const data = new experimental_StreamData();

      let appendedMessages: CreateMessage[] = [];
      const stream = OpenAIStream(
        await fetch(server.api + '/mock-tool-call', {
          headers: {
            'x-mock-service': 'openai',
            'x-mock-type': 'tool_call',
          },
        }),
        {
          onFinal() {
            data.close();
          },
          async experimental_onToolCall(
            toolCallPayload,
            appendToolCallMessages,
          ) {
            const { tools } = toolCallPayload;
            for (const { id, func } of tools) {
              data.append({ function_name: func.name });
              if (func.name === 'get_date_time') {
                const date = new Date(2023, 11, 17, 12, 31, 50, 69);
                appendToolCallMessages({
                  tool_call_id: id,
                  function_name: func.name,
                  tool_call_result: {
                    date: date.toLocaleDateString(),
                    time: date.toLocaleTimeString(),
                  },
                });
              }
              if (func.name === 'open_webpage') {
                appendToolCallMessages({
                  tool_call_id: id,
                  function_name: func.name,
                  tool_call_result: {
                    url: 'https://openai.com',
                  },
                });
              }
            }
            appendedMessages = appendToolCallMessages();
            return 'experimental_onToolCall-return-value';
          },
          experimental_streamData: true,
        },
      );

      const response = new StreamingTextResponse(stream, {}, data);

      const client = createClient(response);
      const chunks = await client.readAll();

      // Expet what we added to the data stream, and the result of the tool calls
      expect(chunks).toEqual([
        '2:[{"function_name":"get_date_time"},{"function_name":"open_webpage"}]\n',
        '0:"experimental_onToolCall-return-value"\n',
      ]);
      expect(appendedMessages).toEqual([
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              function: {
                arguments: '{}',
                name: 'get_date_time',
              },
              id: 'call_NPkY32jNUOb3Kkm7v9cOgmVg',
              type: 'function',
            },
            {
              function: {
                arguments: '{"url":"https://www.linkedin.com/in/jessepascoe"}',
                name: 'open_webpage',
              },
              id: 'call_pOyOtXFQltSjUGsF7gnLAEcD',
              type: 'function',
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_NPkY32jNUOb3Kkm7v9cOgmVg',
          name: 'get_date_time',
          content: '{"date":"12/17/2023","time":"12:31:50 PM"}',
        },
        {
          role: 'tool',
          tool_call_id: 'call_pOyOtXFQltSjUGsF7gnLAEcD',
          name: 'open_webpage',
          content: '{"url":"https://openai.com"}',
        },
      ]);
    });
  });

  describe('React Streaming', () => {
    async function extractReactRowContents(
      response: Promise<ReactResponseRow>,
    ) {
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

    it('should stream text response as React rows', async () => {
      const stream = OpenAIStream(
        await fetch(server.api, {
          headers: {
            'x-mock-service': 'openai',
            'x-mock-type': 'chat',
          },
        }),
      );
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

    it('should stream React response as React rows', async () => {
      const stream = OpenAIStream(
        await fetch(server.api, {
          headers: {
            'x-mock-service': 'openai',
            'x-mock-type': 'chat',
          },
        }),
      );
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

    it('should stream text response as React rows from data stream', async () => {
      const data = new experimental_StreamData();

      const stream = OpenAIStream(
        await fetch(server.api, {
          headers: {
            'x-mock-service': 'openai',
            'x-mock-type': 'chat',
          },
        }),
        {
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
        },
      );

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

    it('should stream React response as React rows from data stream', async () => {
      const data = new experimental_StreamData();

      const stream = OpenAIStream(
        await fetch(server.api, {
          headers: {
            'x-mock-service': 'openai',
            'x-mock-type': 'chat',
          },
        }),
        {
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
        },
      );

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

    it('should stream React response as React rows from data stream when data is appended', async () => {
      const data = new experimental_StreamData();

      const stream = OpenAIStream(
        await fetch(server.api + '/mock-func-call', {
          headers: {
            'x-mock-service': 'openai',
            'x-mock-type': 'func_call',
          },
        }),
        {
          onFinal() {
            data.close();
          },
          async experimental_onFunctionCall({ name }) {
            data.append({ fn: name });
            return undefined;
          },
          experimental_streamData: true,
        },
      );

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
});
