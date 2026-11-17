import { readFile } from 'node:fs/promises';
import type { FxModelRuntime } from './fx-model-runtime';

/**
 * A request the test model runtime received.
 */
export type TestModelRequest = {
  /**
   * Requested URL.
   */
  url: string;

  /**
   * HTTP method.
   */
  method: string;

  /**
   * Request headers.
   */
  headers: Headers;

  /**
   * Request body as text.
   */
  body: string;
};

/**
 * A scripted response of the test model runtime: a string is the body of a
 * successful event stream response, a `Response` is returned as is, and a
 * function creates the response for the request.
 */
export type TestModelResponse =
  | string
  | Response
  | ((request: TestModelRequest) => Response | Promise<Response>);

/**
 * Scripted model access for adapter tests: responses from a queue instead of
 * AI Gateway requests.
 */
export type TestModelRuntime = FxModelRuntime & {
  /**
   * Model requests received, in order.
   */
  requests: TestModelRequest[];

  /**
   * Model catalog requests received, in order.
   */
  catalogRequests: TestModelRequest[];

  /**
   * Appends scripted responses to the queue.
   */
  push(...responses: TestModelResponse[]): void;
};

/**
 * Creates a model runtime that answers each model request with the next
 * scripted response and records the request. A request without a scripted
 * response rejects. Model catalog requests are answered with the given
 * catalog, an empty one by default, without consuming a scripted response.
 */
export function createTestModelRuntime(
  options: {
    /**
     * Scripted responses, in order.
     */
    responses?: TestModelResponse[];

    /**
     * Body of the model catalog response.
     */
    catalog?: string;
  } = {},
): TestModelRuntime {
  const queue = [...(options.responses ?? [])];
  const requests: TestModelRequest[] = [];
  const catalogRequests: TestModelRequest[] = [];
  const catalog = options.catalog ?? '{"object":"list","data":[]}';
  return {
    apiKey: 'test-api-key',
    requests,
    catalogRequests,
    push(...responses) {
      queue.push(...responses);
    },
    // oxlint-disable-next-line ai-sdk/require-object-parameter -- `fetch` signature.
    async fetch(input, init) {
      const request = new Request(input, init);
      const recorded: TestModelRequest = {
        url: request.url,
        method: request.method,
        headers: new Headers(request.headers),
        body: await request.text(),
      };
      if (new URL(recorded.url).pathname === '/coding-agent/v1/models') {
        catalogRequests.push(recorded);
        return new Response(catalog, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      requests.push(recorded);
      const next = queue.shift();
      if (next == null) {
        throw new Error(
          `unexpected request ${recorded.method} ${recorded.url}`,
        );
      }
      if (typeof next === 'string') {
        return new Response(next, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      return typeof next === 'function' ? next(recorded) : next;
    },
  };
}

/**
 * Reads a fixture file from `src/__fixtures__` as text.
 */
export function readFixture(options: {
  /**
   * File name of the fixture.
   */
  name: string;
}): Promise<string> {
  return readFile(
    new URL(`./__fixtures__/${options.name}`, import.meta.url),
    'utf8',
  );
}
