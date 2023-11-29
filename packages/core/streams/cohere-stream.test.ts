import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  CohereStream,
  StreamingTextResponse,
  experimental_StreamData,
} from '.';
import { cohereChunks } from '../tests/snapshots/cohere';
import { readAllChunks } from '../tests/utils/mock-client';

const encoder = new TextEncoder();

const url = 'http://localhost/';

const server = setupServer(
  http.get(url, () => {
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of cohereChunks) {
          controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
        }

        controller.close();
      },
    });

    return new HttpResponse(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }),
);

describe('CohereStream', () => {
  beforeAll(() => {
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('should be able to parse SSE and receive the streamed response', async () => {
    const stream = CohereStream(await fetch(url));

    const response = new StreamingTextResponse(stream);

    expect(await readAllChunks(response)).toEqual([
      ' Hello',
      ',',
      ' world',
      '.',
      ' ',
    ]);
  });

  describe('StreamData protocol', () => {
    it('should send text', async () => {
      const data = new experimental_StreamData();

      const stream = CohereStream(await fetch(url), {
        onFinal() {
          data.close();
        },
        experimental_streamData: true,
      });

      const response = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(response)).toEqual([
        '0:" Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
        '0:" "\n',
      ]);
    });

    it('should send text and data', async () => {
      const data = new experimental_StreamData();

      data.append({ t1: 'v1' });

      const stream = CohereStream(await fetch(url), {
        onFinal() {
          data.close();
        },
        experimental_streamData: true,
      });

      const response = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(response)).toEqual([
        '2:[{"t1":"v1"}]\n',
        '0:" Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
        '0:" "\n',
      ]);
    });
  });
});
