import { GoogleGenerativeAIStream, StreamingTextResponse, StreamData } from '.';
import { readAllChunks } from '../tests/utils/mock-client';

function simulateGenerativeAIResponse(chunks: any[]) {
  chunks = chunks.slice(); // make a copy
  return {
    stream: {
      [Symbol.asyncIterator]() {
        return {
          next() {
            const chunk = chunks.shift();
            if (chunk) {
              return Promise.resolve({
                value: chunk,
                done: false,
              });
            } else {
              return Promise.resolve({ done: true });
            }
          },
        };
      },
    } as AsyncIterable<any>,
  };
}

export const googleGenerativeAIChunks = [
  {
    candidates: [
      {
        content: {
          parts: [{ text: 'Hello' }],
        },
      },
    ],
  },
  {
    candidates: [
      {
        content: {
          parts: [{ text: ',' }],
        },
      },
    ],
  },
  {
    candidates: [
      {
        content: {
          parts: [{ text: ' world' }],
        },
      },
    ],
  },
  {
    candidates: [
      {
        content: {
          parts: [{ text: '.' }],
        },
      },
    ],
  },
];

it('should send text', async () => {
  const data = new StreamData();

  const aiResponse = simulateGenerativeAIResponse(googleGenerativeAIChunks);
  const stream = GoogleGenerativeAIStream(aiResponse, {
    onFinal() {
      data.close();
    },
  });

  const response = new StreamingTextResponse(stream, {}, data);

  expect(await readAllChunks(response)).toEqual([
    '0:"Hello"\n',
    '0:","\n',
    '0:" world"\n',
    '0:"."\n',
  ]);
});

it('should send text and data', async () => {
  const data = new StreamData();

  data.append({ t1: 'v1' });

  const aiResponse = simulateGenerativeAIResponse(googleGenerativeAIChunks);
  const stream = GoogleGenerativeAIStream(aiResponse, {
    onFinal() {
      data.close();
    },
  });

  const response = new StreamingTextResponse(stream, {}, data);

  expect(await readAllChunks(response)).toEqual([
    '2:[{"t1":"v1"}]\n',
    '0:"Hello"\n',
    '0:","\n',
    '0:" world"\n',
    '0:"."\n',
  ]);
});
