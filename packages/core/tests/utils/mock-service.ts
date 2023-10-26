import { ServerResponse, createServer } from 'node:http';

import {
  chatCompletionChunks,
  chatCompletionChunksWithFunctionCall,
  chatCompletionChunksWithSpecifiedFunctionCall,
} from '../snapshots/openai-chat';
import { cohereChunks } from '../snapshots/cohere';

async function flushDataToResponse(
  res: ServerResponse,
  chunks: { value: object }[],
  suffix?: string,
  delayInMs = 5,
) {
  let resolve = () => {};
  let waitForDrain = new Promise<void>(res => (resolve = res));
  res.addListener('drain', () => {
    resolve();
    waitForDrain = new Promise<void>(res => (resolve = res));
  });

  try {
    for (const item of chunks) {
      const data = `data: ${JSON.stringify(item.value)}\n\n`;
      const ok = res.write(data);
      if (!ok) {
        await waitForDrain;
      }

      await new Promise(r => setTimeout(r, delayInMs));
    }
    if (suffix) {
      const data = `data: ${suffix}\n\n`;
      res.write(data);
    }
  } catch (e) {}
  res.end();
}

async function flushDataToResponseCohere(
  res: ServerResponse,
  chunks: { value: object }[],
  delayInMs = 5,
) {
  let resolve = () => {};
  let waitForDrain = new Promise<void>(res => (resolve = res));
  res.addListener('drain', () => {
    resolve();
    waitForDrain = new Promise<void>(res => (resolve = res));
  });

  try {
    for (const item of chunks) {
      const data = `${JSON.stringify(item.value)}\n`;
      const ok = res.write(data);
      if (!ok) {
        await waitForDrain;
      }

      await new Promise(r => setTimeout(r, delayInMs));
    }
  } catch (e) {}
  res.end();
}

export const setup = (port = 3030) => {
  let recentFlushed: any[] = [];

  const server = createServer((req, res) => {
    const service = req.headers['x-mock-service'] || 'openai';
    const type = req.headers['x-mock-type'] || 'chat' || 'func_call';
    const flushDelayHeader = req.headers['x-flush-delay'];
    const flushDelayInMs =
      flushDelayHeader === undefined ? undefined : +flushDelayHeader;

    switch (type) {
      case 'func_call':
      case 'func_call_with_specified_function':
        switch (service) {
          case 'openai':
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            });
            res.flushHeaders();
            recentFlushed = [];
            const mock =
              type === 'func_call_with_specified_function'
                ? chatCompletionChunksWithSpecifiedFunctionCall
                : chatCompletionChunksWithFunctionCall;
            flushDataToResponse(
              res,
              mock.map(
                value =>
                  new Proxy(
                    { value },
                    {
                      get(target) {
                        recentFlushed.push(target.value);
                        return target.value;
                      },
                    },
                  ),
              ),
              '[DONE]',
              flushDelayInMs,
            );
            break;
          default:
            throw new Error(`Unknown service: ${service}`);
        }
        break;
      case 'chat':
        switch (service) {
          case 'cohere': {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            });
            res.flushHeaders();
            recentFlushed = [];

            flushDataToResponseCohere(
              res,
              cohereChunks.map(
                value =>
                  new Proxy(
                    { value },
                    {
                      get(target) {
                        recentFlushed.push(target.value);
                        return target.value;
                      },
                    },
                  ),
              ),
              flushDelayInMs,
            );
            break;
          }
          case 'openai':
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            });
            res.flushHeaders();
            recentFlushed = [];
            flushDataToResponse(
              res,
              chatCompletionChunks.map(
                value =>
                  new Proxy(
                    { value },
                    {
                      get(target) {
                        recentFlushed.push(target.value);
                        return target.value;
                      },
                    },
                  ),
              ),
              '[DONE]',
              flushDelayInMs,
            );
            break;
          default:
            throw new Error(`Unknown service: ${service}`);
        }
        break;
      default:
        throw new Error(`Unknown type: ${type}`);
    }
  });

  server.listen(port);

  return {
    port,
    api: `http://localhost:${port}`,
    teardown: () => {
      server.close();
    },
    getRecentFlushed: () => recentFlushed,
  };
};
