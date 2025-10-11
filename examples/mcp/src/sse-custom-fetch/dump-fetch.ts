import 'dotenv/config';
import { FetchFunction } from '@ai-sdk/provider-utils';
import { createWriteStream, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

/**
 * Creates a fetch function that dumps the response body into a file in the format "fetch_<timestamp>.dump".
 */
export function createDumpFetch() {
  const fetch: FetchFunction = async (input, init) => {
    const response = await globalThis.fetch(input, init);
    if (response.body != null) {
      const filePath = resolve(__dirname, 'dist', `fetch_${Date.now()}.dump`);
      mkdirSync(dirname(filePath), { recursive: true });
      const writer = createWriteStream(filePath);
      return new Response(
        response.body.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              writer.write(chunk);
              controller.enqueue(chunk);
            },
            flush() {
              writer.close();
            },
          }),
        ),
        response,
      );
    }
    return response;
  };
  return fetch;
}
