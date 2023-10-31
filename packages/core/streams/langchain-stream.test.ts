import {
  LangChainStream,
  StreamingTextResponse,
  createStreamDataTransformer,
  experimental_StreamData,
} from '.';
import { createClient } from '../tests/utils/mock-client';
import { setup } from '../tests/utils/mock-service';

// need to mock uuid before importing LangChain
jest.mock('uuid', () => {
  let count = 0;
  return {
    v4: () => `uuid-${count++}`,
  };
});

import { ChatOpenAI } from 'langchain/chat_models/openai';
import { BytesOutputParser } from 'langchain/schema/output_parser';
import { HumanMessage } from 'langchain/schema';
import { PromptTemplate } from 'langchain/prompts';

describe('LangchainStream', () => {
  let server: ReturnType<typeof setup>;
  beforeAll(() => {
    server = setup(3031);
  });
  afterAll(async () => server.teardown());

  function readAllChunks(response: Response) {
    return createClient(response).readAll();
  }

  describe('LangChain Expression Language call', () => {
    it('should be able to parse SSE and receive the streamed response', async () => {
      const model = new ChatOpenAI({
        streaming: true,
        openAIApiKey: 'fake',
        configuration: {
          baseURL: server.api,
          defaultHeaders: {
            'x-mock-service': 'openai',
            'x-mock-type': 'chat',
          },
        },
      });

      const stream = await PromptTemplate.fromTemplate('{input}')
        .pipe(model)
        .pipe(new BytesOutputParser())
        .stream({ input: 'Hello' });

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

        const model = new ChatOpenAI({
          streaming: true,
          openAIApiKey: 'fake',
          configuration: {
            baseURL: server.api,
            defaultHeaders: {
              'x-mock-service': 'openai',
              'x-mock-type': 'chat',
            },
          },
        });

        const stream = await PromptTemplate.fromTemplate('{input}')
          .pipe(model)
          .pipe(new BytesOutputParser())
          .stream(
            { input: 'Hello' },
            {
              callbacks: [
                {
                  handleChainEnd(outputs, runId, parentRunId) {
                    // check that main chain (without parent) is finished:
                    if (parentRunId == null) {
                      data.close();
                    }
                  },
                },
              ],
            },
          );

        const response = new StreamingTextResponse(
          stream.pipeThrough(createStreamDataTransformer(true)),
          {},
          data,
        );

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

        const model = new ChatOpenAI({
          streaming: true,
          openAIApiKey: 'fake',
          configuration: {
            baseURL: server.api,
            defaultHeaders: {
              'x-mock-service': 'openai',
              'x-mock-type': 'chat',
            },
          },
        });

        const stream = await PromptTemplate.fromTemplate('{input}')
          .pipe(model)
          .pipe(new BytesOutputParser())
          .stream(
            { input: 'Hello' },
            {
              callbacks: [
                {
                  handleChainEnd(outputs, runId, parentRunId) {
                    // check that main chain (without parent) is finished:
                    if (parentRunId == null) {
                      data.close();
                    }
                  },
                },
              ],
            },
          );

        const response = new StreamingTextResponse(
          stream.pipeThrough(createStreamDataTransformer(true)),
          {},
          data,
        );

        expect(await readAllChunks(response)).toEqual([
          '2:"[{\\"t1\\":\\"v1\\"}]"\n',
          '0:""\n',
          '0:"Hello"\n',
          '0:","\n',
          '0:" world"\n',
          '0:"."\n',
          '0:""\n',
        ]);
      });
    });
  });

  describe('LangChain LLM call', () => {
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
          },
        },
      });

      llm
        .call([new HumanMessage('hello')], {}, [handlers])
        .catch(console.error);

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
            },
          },
        });

        llm
          .call([new HumanMessage('hello')], {}, [handlers])
          .catch(console.error);

        const response = new StreamingTextResponse(stream, {}, data);

        expect(await readAllChunks(response)).toEqual([
          '2:"[{\\"t1\\":\\"v1\\"}]"\n',
          '0:""\n',
          '0:"Hello"\n',
          '0:","\n',
          '0:" world"\n',
          '0:"."\n',
          '0:""\n',
        ]);
      });
    });
  });
});
