import OpenAI from 'openai';
import { OpenAIStream, StreamingTextResponse, StreamData } from '.';
import {
  chatCompletionChunksWithToolCall,
  openaiChatCompletionChunks,
  openaiFunctionCallChunks,
} from '../tests/snapshots/openai-chat';
import { createClient, readAllChunks } from '../tests/utils/mock-client';
import { DEFAULT_TEST_URL, createMockServer } from '../tests/utils/mock-server';
import { azureOpenaiChatCompletionChunks } from '../tests/snapshots/azure-openai';

const FUNCTION_CALL_TEST_URL = DEFAULT_TEST_URL + 'mock-func-call';
const TOOL_CALL_TEST_URL = DEFAULT_TEST_URL + 'mock-tool-call';

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
  {
    url: TOOL_CALL_TEST_URL,
    chunks: chatCompletionChunksWithToolCall,
    formatChunk: chunk => `data: ${JSON.stringify(chunk)}\n\n`,
    suffix: 'data: [DONE]',
  },
]);

describe('OpenAIStream', () => {
  beforeAll(() => {
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

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

  it('should send text', async () => {
    const data = new StreamData();

    const stream = OpenAIStream(await fetch(DEFAULT_TEST_URL), {
      onFinal() {
        data.close();
      },
    });

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
    const data = new StreamData();

    const stream = OpenAIStream(await fetch(FUNCTION_CALL_TEST_URL), {
      onFinal() {
        data.close();
      },
    });

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
    const data = new StreamData();

    const stream = OpenAIStream(await fetch(FUNCTION_CALL_TEST_URL), {
      onFinal() {
        data.close();
      },
      async experimental_onFunctionCall({ name }) {
        // no response
      },
    });

    const response = new StreamingTextResponse(stream, {}, data);

    const client = createClient(response);
    const chunks = await client.readAll();

    expect(chunks).toEqual([
      '1:{"function_call":{"name":"get_current_weather","arguments":"{\\n\\"location\\": \\"Charlottesville, Virginia\\",\\n\\"format\\": \\"celsius\\"\\n}"}}\n',
    ]);
  });

  it('should not call onText for function calls', async () => {
    const data = new StreamData();

    const stream = OpenAIStream(await fetch(FUNCTION_CALL_TEST_URL), {
      onFinal() {
        data.close();
      },
      async experimental_onFunctionCall({ name }) {
        // no response
      },
      onText(token) {
        assert.fail(`onText should not be called (token: ${token})`);
      },
    });

    const response = new StreamingTextResponse(stream, {}, data);

    const client = createClient(response);

    await client.readAll(); // consume stream
  });

  it('should send function response and data when onFunctionCall is defined, returns undefined, and data is added', async () => {
    const data = new StreamData();

    const stream = OpenAIStream(await fetch(FUNCTION_CALL_TEST_URL), {
      onFinal() {
        data.close();
      },
      async experimental_onFunctionCall({ name }) {
        data.append({ fn: name });

        // no response
      },
    });

    const response = new StreamingTextResponse(stream, {}, data);

    const client = createClient(response);
    const chunks = await client.readAll();

    expect(chunks).toEqual([
      '2:[{"fn":"get_current_weather"}]\n',
      '1:{"function_call":{"name":"get_current_weather","arguments":"{\\n\\"location\\": \\"Charlottesville, Virginia\\",\\n\\"format\\": \\"celsius\\"\\n}"}}\n',
    ]);
  });

  it('should send return value when onFunctionCall is defined and returns value', async () => {
    const data = new StreamData();

    const stream = OpenAIStream(await fetch(FUNCTION_CALL_TEST_URL), {
      onFinal() {
        data.close();
      },
      async experimental_onFunctionCall({ name }) {
        return 'experimental_onFunctionCall-return-value';
      },
    });

    const response = new StreamingTextResponse(stream, {}, data);

    const client = createClient(response);
    const chunks = await client.readAll();

    expect(chunks).toEqual(['0:"experimental_onFunctionCall-return-value"\n']);
  });

  it('should send return value and data when onFunctionCall is defined, returns value and data is added', async () => {
    const data = new StreamData();

    const stream = OpenAIStream(await fetch(FUNCTION_CALL_TEST_URL), {
      onFinal() {
        data.close();
      },
      async experimental_onFunctionCall({ name }) {
        data.append({ fn: name });
        return 'experimental_onFunctionCall-return-value';
      },
    });

    const response = new StreamingTextResponse(stream, {}, data);

    const client = createClient(response);
    const chunks = await client.readAll();

    expect(chunks).toEqual([
      '2:[{"fn":"get_current_weather"}]\n',
      '0:"experimental_onFunctionCall-return-value"\n',
    ]);
  });

  it('should send text and data', async () => {
    const data = new StreamData();

    data.append({ t1: 'v1' });

    const stream = OpenAIStream(await fetch(DEFAULT_TEST_URL), {
      onFinal() {
        data.close();
      },
    });

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

  describe('tool calls', () => {
    it('should call onToolCall handler with the tools', async () => {
      let toolCalls: any = undefined;

      const stream = OpenAIStream(await fetch(TOOL_CALL_TEST_URL), {
        async experimental_onToolCall(payload, appendToolCallMessage) {
          toolCalls = payload;
        },
      });

      const response = new StreamingTextResponse(stream);

      await createClient(response).readAll(); // consume stream

      expect(toolCalls).toEqual({
        tools: [
          {
            func: {
              arguments: {},
              name: 'get_date_time',
            },
            id: 'call_NPkY32jNUOb3Kkm7v9cOgmVg',
            type: 'function',
          },
          {
            func: {
              arguments: {
                url: 'https://www.linkedin.com/in/jessepascoe',
              },
              name: 'open_webpage',
            },
            id: 'call_pOyOtXFQltSjUGsF7gnLAEcD',
            type: 'function',
          },
        ],
      });
    });

    it('should call onFinal with tool response when onToolCall returns string', async () => {
      let finalResponse: any = undefined;

      const stream = OpenAIStream(await fetch(TOOL_CALL_TEST_URL), {
        async experimental_onToolCall(payload, appendToolCallMessage) {
          return 'tool-response';
        },

        onFinal(response) {
          finalResponse = response;
        },
      });

      const response = new StreamingTextResponse(stream);
      await createClient(response).readAll(); // consume stream

      expect(finalResponse).toEqual('tool-response');
    });
  });

  describe('Azure SDK', () => {
    async function* asyncIterableFromArray(array: any[]) {
      for (const item of array) {
        // You can also perform any asynchronous operations here if needed
        yield item;
      }
    }

    it('should send text', async () => {
      const data = new StreamData();

      const stream = OpenAIStream(
        asyncIterableFromArray(azureOpenaiChatCompletionChunks),
        {
          onFinal() {
            data.close();
          },
        },
      );

      const response = new StreamingTextResponse(stream, {}, data);

      const client = createClient(response);
      const chunks = await client.readAll();

      expect(chunks).toEqual([
        '0:"Hello"\n',
        '0:"!"\n',
        '0:" How"\n',
        '0:" can"\n',
        '0:" I"\n',
        '0:" assist"\n',
        '0:" you"\n',
        '0:" today"\n',
        '0:"?"\n',
      ]);
    });
  });
});
