/**
 * This is a naive implementation of the streaming React response API.
 * Currently, it can carry the original raw content, data payload and a special
 * UI payload and stream them via "rows" (nested promises).
 * It must be used inside Server Actions so Flight can encode the React elements.
 *
 * It is naive as unlike the StreamingTextResponse, it does not send the diff
 * between the rows, but flushing the full payload on each row.
 */

import { parseComplexResponse } from '../shared/parse-complex-response';
import { IdGenerator, JSONValue } from '../shared/types';
import { nanoid } from '../shared/utils';
import { StreamData } from './stream-data';

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
      ui?: (message: {
        content: string;
        data?: JSONValue[];
      }) => UINode | Promise<UINode>;
      data?: StreamData;
      generateId?: IdGenerator;
    },
  ) {
    let resolveFunc: (row: ReactResponseRow) => void = () => {};
    let next = new Promise<ReactResponseRow>(resolve => {
      resolveFunc = resolve;
    });

    const processedStream: ReadableStream<Uint8Array> =
      options?.data != null ? res.pipeThrough(options?.data?.stream) : res;

    let lastPayload: Payload | undefined = undefined;

    // runs asynchronously (no await on purpose)
    parseComplexResponse({
      reader: processedStream.getReader(),
      update: (merged, data) => {
        const content = merged[0]?.content ?? '';
        const ui = options?.ui?.({ content, data }) || content;
        const payload: Payload = { ui, content };

        const resolvePrevious = resolveFunc;
        const nextRow = new Promise<ReactResponseRow>(resolve => {
          resolveFunc = resolve;
        });

        resolvePrevious({
          next: nextRow,
          ...payload,
        });

        lastPayload = payload;
      },
      generateId: options?.generateId ?? nanoid,
      onFinish: () => {
        // The last payload is resolved twice. This is necessary because we immediately
        // push out a payload, but we also need to forward the finish event with a payload.
        if (lastPayload !== undefined) {
          resolveFunc({
            next: null,
            ...lastPayload,
          });
        }
      },
    });

    return next;
  }
}
