import { ServerResponse, createServer } from 'node:http';

import {
  chatCompletionChunks,
  chatCompletionChunksWithFunctionCall,
  chatCompletionChunksWithSpecifiedFunctionCall,
} from '../snapshots/openai-chat';
import { cohereChunks } from '../snapshots/cohere';
import { huggingfaceChunks } from '../snapshots/huggingface';
import { replicateTextChunks } from '../snapshots/replicate';
import { anthropicChunks } from '../snapshots/anthropic';

async function flushDataToResponse(
  res: ServerResponse,
  chunks: { value: object | string }[],
  format: (value: object | string) => string,
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
      const ok = res.write(format(item.value));
      if (!ok) {
        await waitForDrain;
      }

      await new Promise(r => setTimeout(r, delayInMs));
    }
    if (suffix) {
      res.write(suffix);
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
              value => `data: ${JSON.stringify(value)}\n\n`,
              'data: [DONE]',
              flushDelayInMs,
            );
            break;
          default:
            throw new Error(`Unknown service: ${service}`);
        }
        break;
      case 'chat':
        switch (service) {
          case 'anthropic': {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            });
            res.flushHeaders();
            recentFlushed = [];

            flushDataToResponse(
              res,
              anthropicChunks.map(
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
              value => `event: completion\ndata: ${JSON.stringify(value)}\n\n`,
              undefined,
              flushDelayInMs,
            );
            break;
          }

          case 'cohere': {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            });
            res.flushHeaders();
            recentFlushed = [];

            flushDataToResponse(
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
              value => `${JSON.stringify(value)}\n`,
              undefined,
              flushDelayInMs,
            );
            break;
          }
          case 'huggingface': {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            });
            res.flushHeaders();
            recentFlushed = [];
            flushDataToResponse(
              res,
              huggingfaceChunks.map(
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
              value => `data: ${JSON.stringify(value)}\n\n`,
              undefined,
              flushDelayInMs,
            );
            break;
          }
          case 'huggingface': {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            });
            res.flushHeaders();
            recentFlushed = [];
            flushDataToResponse(
              res,
              huggingfaceChunks.map(
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
              value => `data: ${value}\n\n`,
              undefined,
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
              value => `data: ${JSON.stringify(value)}\n\n`,
              'data: [DONE]',
              flushDelayInMs,
            );
            break;

          case 'replicate': {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            });
            res.flushHeaders();
            recentFlushed = [];
            flushDataToResponse(
              res,
              replicateTextChunks.map(
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
              value => value.toString(),
              undefined,
              flushDelayInMs,
            );
            break;
          }

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
    teardown: async () => {
      await new Promise((resolve, reject) => {
        server.close(err => {
          if (err) {
            reject(err);
          } else {
            resolve(undefined);
          }
        });
      });
    },
    getRecentFlushed: () => recentFlushed,
  };
};
