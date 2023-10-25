import { createClient } from '../tests/utils/mock-client';
import { setup } from '../tests/utils/mock-service';

describe('LangchainStream', () => {
  if (typeof Response === 'undefined') {
    xit("should skip this test on Node 16 because it doesn't support `Response`", () => {});
    return;
  }

  let server: ReturnType<typeof setup>;
  beforeAll(() => {
    server = setup(3031);
  });
  afterAll(() => {
    server.teardown();
  });

  const { LangChainStream, StreamingTextResponse, experimental_StreamData } =
    require('.') as typeof import('.');
  const { ChatOpenAI } =
    require('langchain/chat_models/openai') as typeof import('langchain/chat_models/openai');
  const { HumanMessage } =
    require('langchain/schema') as typeof import('langchain/schema');

  function readAllChunks(response: Response) {
    return createClient(response).readAll();
  }

  it('should be able to parse SSE and receive the streamed response', async () => {
    const { stream, handlers } = LangChainStream();

    const llm = new ChatOpenAI({
      streaming: true,
      openAIApiKey: 'fake',
      configuration: {
        baseURL: server.api,
        defaultHeaders: {
          'x-mock-service': 'openai',
          'x-mock-type': 'chat',
          'x-flush-delay': '5',
        },
      },
    });

    llm.call([new HumanMessage('hello')], {}, [handlers]).catch(console.error);

    const response = new StreamingTextResponse(stream);

    expect(await readAllChunks(response)).toEqual([
      '',
      'Hello',
      ',',
      ' world',
      '.',
      '',
    ]);
  });

  describe('StreamData prototcol', () => {
    it('should send text', async () => {
      const data = new experimental_StreamData();

      const { stream, handlers } = LangChainStream({
        onFinal() {
          data.close();
        },
        experimental_streamData: true,
      });

      const llm = new ChatOpenAI({
        streaming: true,
        openAIApiKey: 'fake',
        configuration: {
          baseURL: server.api,
          defaultHeaders: {
            'x-mock-service': 'openai',
            'x-mock-type': 'chat',
            'x-flush-delay': '5',
          },
        },
      });

      llm
        .call([new HumanMessage('hello')], {}, [handlers])
        .catch(console.error);

      const response = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(response)).toEqual([
        '0:""\n',
        '0:"Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
        '0:""\n',
      ]);
    });

    it('should send text and data', async () => {
      const data = new experimental_StreamData();

      data.append({ t1: 'v1' });

      const { stream, handlers } = LangChainStream({
        onFinal() {
          data.close();
        },
        experimental_streamData: true,
      });

      const llm = new ChatOpenAI({
        streaming: true,
        openAIApiKey: 'fake',
        configuration: {
          baseURL: server.api,
          defaultHeaders: {
            'x-mock-service': 'openai',
            'x-mock-type': 'chat',
            'x-flush-delay': '5',
          },
        },
      });

      llm
        .call([new HumanMessage('hello')], {}, [handlers])
        .catch(console.error);

      const response = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(response)).toEqual([
        '0:""\n',
        '2:"[{\\"t1\\":\\"v1\\"}]"\n',
        '0:"Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
        '0:""\n',
      ]);
    });
  });
});
