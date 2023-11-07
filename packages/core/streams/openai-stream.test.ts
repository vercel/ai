import {
  OpenAIStream,
  StreamingTextResponse,
  experimental_StreamData,
} from '.';
import OpenAI from 'openai';
import { createClient } from '../tests/utils/mock-client';
import { setup } from '../tests/utils/mock-service';

describe('OpenAIStream', () => {
  let server: ReturnType<typeof setup>;
  beforeAll(() => {
    server = setup();
  });
  afterAll(async () => server.teardown());

  // deactivated to only test types
  xit('should not throw type errors', async () => {
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
      `"["Hello",","," world","."]"`,
    );
    expect(JSON.stringify(server.getRecentFlushed())).toMatchInlineSnapshot(
      `"[{"id":"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC","object":"chat.completion.chunk","created":1686901302,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"role":"assistant"},"index":0,"finish_reason":null}]},{"id":"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC","object":"chat.completion.chunk","created":1686901302,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}]},{"id":"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC","object":"chat.completion.chunk","created":1686901302,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":","},"index":0,"finish_reason":null}]},{"id":"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC","object":"chat.completion.chunk","created":1686901302,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":" world"},"index":0,"finish_reason":null}]},{"id":"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC","object":"chat.completion.chunk","created":1686901302,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":"."},"index":0,"finish_reason":null}]},{"id":"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC","object":"chat.completion.chunk","created":1686901302,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{},"index":0,"finish_reason":"stop"}]}]"`,
    );
  });

  it('should correctly parse and escape function call JSON chunks', async () => {
    const { OpenAIStream, StreamingTextResponse } =
      require('.') as typeof import('.');

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
    expect(JSON.stringify(chunks)).toMatchInlineSnapshot(`"["Hello"]"`);
    expect(JSON.stringify(server.getRecentFlushed())).toMatchInlineSnapshot(
      `"[{"id":"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC","object":"chat.completion.chunk","created":1686901302,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"role":"assistant"},"index":0,"finish_reason":null}]},{"id":"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC","object":"chat.completion.chunk","created":1686901302,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}]}]"`,
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
        '1:"{\\"function_call\\": {\\"name\\": \\"get_current_weather\\", \\"arguments\\": \\"{\\\\n\\\\\\"location\\\\\\": \\\\\\"Charlottesville, Virginia\\\\\\",\\\\n\\\\\\"format\\\\\\": \\\\\\"celsius\\\\\\"\\\\n}\\"}}"\n',
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
        '2:"[{\\"fn\\":\\"get_current_weather\\"}]"\n',
        '1:"{\\"function_call\\": {\\"name\\": \\"get_current_weather\\", \\"arguments\\": \\"{\\\\n\\\\\\"location\\\\\\": \\\\\\"Charlottesville, Virginia\\\\\\",\\\\n\\\\\\"format\\\\\\": \\\\\\"celsius\\\\\\"\\\\n}\\"}}"\n',
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
        '2:"[{\\"fn\\":\\"get_current_weather\\"}]"\n',
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
        '2:"[{\\"t1\\":\\"v1\\"}]"\n',
        '0:"Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ]);
    });
  });
});
