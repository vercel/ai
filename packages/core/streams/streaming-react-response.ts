/**
 * This is a naive implementation of the streaming React response API.
 * Currently, it can carry the original raw content, data payload and a special
 * UI payload and stream them via "rows" (nested promises).
 * It must be used inside Server Actions so Flight can encode the React elements.
 *
 * It is naive as unlike the StreamingTextResponse, it does not send the diff
 * between the rows, but flushing the full payload on each row.
 */

import { createChunkDecoder } from '../shared/utils';

type UINode = string | JSX.Element | JSX.Element[] | null | undefined;

type Payload = {
  ui: UINode | Promise<UINode>;
  content: string;
};

export type ReactResponseRow = Payload & {
  next: null | Promise<ReactResponseRow>;
};

/**
 * A utility class for streaming React responses.
 */
export class experimental_StreamingReactResponse {
  constructor(
    res: ReadableStream,
    options?: {
      ui?: (message: { content: string }) => UINode | Promise<UINode>;
    },
  ) {
    let resolveFunc: (row: ReactResponseRow) => void = () => {};
    let next = new Promise<ReactResponseRow>(resolve => {
      resolveFunc = resolve;
    });

    let content = '';

    const decode = createChunkDecoder();
    const reader = res.getReader();
    async function readChunk() {
      const { done, value } = await reader.read();
      if (!done) {
        content += decode(value);
      }

      // TODO: Handle generators. With this current implementation we can support
      // synchronous and asynchronous UIs.
      // TODO: Handle function calls.
      const ui = options?.ui?.({ content }) || content;

      const payload: Payload = {
        ui,
        content,
      };

      const resolvePrevious = resolveFunc;
      const nextRow = done
        ? null
        : new Promise<ReactResponseRow>(resolve => {
            resolveFunc = resolve;
          });
      resolvePrevious({
        next: nextRow,
        ...payload,
      });

      if (done) {
        return;
      }

      await readChunk();
    }
    readChunk();

    return next;
  }
}
