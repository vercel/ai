/**
 * Configuration options and helper callback methods for AIStream stream lifecycle events.
 * @interface
 */
export interface AIStreamCallbacksAndOptions {
  /** `onStart`: Called once when the stream is initialized. */
  onStart?: () => Promise<void> | void;
  /** `onFinal`: Called once when the stream is closed with the final completion message. */
  onFinal?: (completion: string) => Promise<void> | void;
  /** `onCompletion`: Called for each tokenized message. */
  onCompletion?: (completion: string) => Promise<void> | void;
  /** `onToken`: Called for each tokenized message. */
  onToken?: (token: string) => Promise<void> | void;
  /** `onText`: Called for each text chunk. */
  onText?: (text: string) => Promise<void> | void;
}

/**
 * Creates a transform stream that encodes input messages and invokes optional callback functions.
 * The transform stream uses the provided callbacks to execute custom logic at different stages of the stream's lifecycle.
 * - `onStart`: Called once when the stream is initialized.
 * - `onToken`: Called for each tokenized message.
 * - `onCompletion`: Called every time an AIStream completion message is received. This can occur multiple times when using e.g. OpenAI functions
 * - `onFinal`: Called once when the stream is closed with the final completion message.
 *
 * This function is useful when you want to process a stream of messages and perform specific actions during the stream's lifecycle.
 *
 * @param {AIStreamCallbacksAndOptions} [callbacks] - An object containing the callback functions.
 * @return {TransformStream<string, Uint8Array>} A transform stream that encodes input messages as Uint8Array and allows the execution of custom logic through callbacks.
 *
 * @example
 * const callbacks = {
 *   onStart: async () => console.log('Stream started'),
 *   onToken: async (token) => console.log(`Token: ${token}`),
 *   onCompletion: async (completion) => console.log(`Completion: ${completion}`)
 *   onFinal: async () => data.close()
 * };
 * const transformer = createCallbacksTransformer(callbacks);
 */
export function createCallbacksTransformer(
  cb: AIStreamCallbacksAndOptions | undefined,
): TransformStream<string | { isText: false; content: string }, Uint8Array> {
  const textEncoder = new TextEncoder();
  let aggregatedResponse = '';
  const callbacks = cb || {};

  return new TransformStream({
    async start(): Promise<void> {
      if (callbacks.onStart) await callbacks.onStart();
    },

    async transform(message, controller): Promise<void> {
      const content = typeof message === 'string' ? message : message.content;

      controller.enqueue(textEncoder.encode(content));

      aggregatedResponse += content;

      if (callbacks.onToken) await callbacks.onToken(content);
      if (callbacks.onText && typeof message === 'string') {
        await callbacks.onText(message);
      }
    },

    async flush(): Promise<void> {
      if (callbacks.onCompletion) {
        await callbacks.onCompletion(aggregatedResponse);
      }
    },
  });
}

/**
 * Returns a stateful function that, when invoked, trims leading whitespace
 * from the input text. The trimming only occurs on the first invocation, ensuring that
 * subsequent calls do not alter the input text. This is particularly useful in scenarios
 * where a text stream is being processed and only the initial whitespace should be removed.
 *
 * @return {function(string): string} A function that takes a string as input and returns a string
 * with leading whitespace removed if it is the first invocation; otherwise, it returns the input unchanged.
 *
 * @example
 * const trimStart = trimStartOfStreamHelper();
 * const output1 = trimStart("   text"); // "text"
 * const output2 = trimStart("   text"); // "   text"
 *
 */
export function trimStartOfStreamHelper(): (text: string) => string {
  let isStreamStart = true;

  return (text: string): string => {
    if (isStreamStart) {
      text = text.trimStart();
      if (text) isStreamStart = false;
    }
    return text;
  };
}
