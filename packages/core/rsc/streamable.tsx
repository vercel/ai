import type { ReactNode } from 'react';
import type OpenAI from 'openai';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

// TODO: This needs to be externalized.
import { OpenAIStream } from '../streams';

import {
  STREAMABLE_VALUE_TYPE,
  DEV_DEFAULT_STREAMABLE_WARNING_TIME,
} from './constants';
import {
  createResolvablePromise,
  createSuspensedChunk,
  consumeStream,
} from './utils';
import type { StreamablePatch, StreamableValue } from './types';

/**
 * Create a piece of changable UI that can be streamed to the client.
 * On the client side, it can be rendered as a normal React node.
 */
function createStreamableUI(initialValue?: React.ReactNode) {
  let currentValue = initialValue;
  let closed = false;
  let { row, resolve, reject } = createSuspensedChunk(initialValue);

  function assertStream(method: string) {
    if (closed) {
      throw new Error(method + ': UI stream is already closed.');
    }
  }

  let warningTimeout: NodeJS.Timeout | undefined;
  function warnUnclosedStream() {
    if (process.env.NODE_ENV === 'development') {
      if (warningTimeout) {
        clearTimeout(warningTimeout);
      }
      warningTimeout = setTimeout(() => {
        console.warn(
          'The streamable UI has been slow to update. This may be a bug or a performance issue or you forgot to call `.done()`.',
        );
      }, DEV_DEFAULT_STREAMABLE_WARNING_TIME);
    }
  }
  warnUnclosedStream();

  return {
    /**
     * The value of the streamable UI. This can be returned from a Server Action and received by the client.
     */
    value: row,
    /**
     * This method updates the current UI node. It takes a new UI node and replaces the old one.
     */
    update(value: React.ReactNode) {
      assertStream('.update()');

      // There is no need to update the value if it's referentially equal.
      if (value === currentValue) {
        warnUnclosedStream();
        return;
      }

      const resolvable = createResolvablePromise();
      currentValue = value;

      resolve({ value: currentValue, done: false, next: resolvable.promise });
      resolve = resolvable.resolve;
      reject = resolvable.reject;

      warnUnclosedStream();
    },
    /**
     * This method is used to append a new UI node to the end of the old one.
     * Once appended a new UI node, the previous UI node cannot be updated anymore.
     *
     * @example
     * ```jsx
     * const ui = createStreamableUI(<div>hello</div>)
     * ui.append(<div>world</div>)
     *
     * // The UI node will be:
     * // <>
     * //   <div>hello</div>
     * //   <div>world</div>
     * // </>
     * ```
     */
    append(value: React.ReactNode) {
      assertStream('.append()');

      const resolvable = createResolvablePromise();
      currentValue = value;

      resolve({ value, done: false, append: true, next: resolvable.promise });
      resolve = resolvable.resolve;
      reject = resolvable.reject;

      warnUnclosedStream();
    },
    /**
     * This method is used to signal that there is an error in the UI stream.
     * It will be thrown on the client side and caught by the nearest error boundary component.
     */
    error(error: any) {
      assertStream('.error()');

      if (warningTimeout) {
        clearTimeout(warningTimeout);
      }
      closed = true;
      reject(error);
    },
    /**
     * This method marks the UI node as finalized. You can either call it without any parameters or with a new UI node as the final state.
     * Once called, the UI node cannot be updated or appended anymore.
     *
     * This method is always **required** to be called, otherwise the response will be stuck in a loading state.
     */
    done(...args: [] | [React.ReactNode]) {
      assertStream('.done()');

      if (warningTimeout) {
        clearTimeout(warningTimeout);
      }
      closed = true;
      if (args.length) {
        resolve({ value: args[0], done: true });
        return;
      }
      resolve({ value: currentValue, done: true });
    },
  };
}

const STREAMABLE_VALUE_INTERNAL_LOCK = Symbol('streamable.value.lock');

/**
 * Create a wrapped, changable value that can be streamed to the client.
 * On the client side, the value can be accessed via the readStreamableValue() API.
 */
function createStreamableValue<T = any, E = any>(
  initialValue?: T | ReadableStream<T>,
) {
  const isReadableStream =
    initialValue instanceof ReadableStream ||
    (typeof initialValue === 'object' &&
      initialValue !== null &&
      'getReader' in initialValue &&
      typeof initialValue.getReader === 'function' &&
      'locked' in initialValue &&
      typeof initialValue.locked === 'boolean');

  if (!isReadableStream) {
    return createStreamableValueImpl<T, E>(initialValue);
  }

  const streamableValue = createStreamableValueImpl<T, E>();

  // Since the streamable value will be from a readable stream, it's not allowed
  // to update the value manually as that introduces race conditions and
  // unexpected behavior.
  // We lock the value to prevent any updates from the user.
  streamableValue[STREAMABLE_VALUE_INTERNAL_LOCK] = true;

  (async () => {
    try {
      // Consume the readable stream and update the value.
      const reader = initialValue.getReader();

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        // Unlock the value to allow updates.
        streamableValue[STREAMABLE_VALUE_INTERNAL_LOCK] = false;
        if (typeof value === 'string') {
          streamableValue.append(value);
        } else {
          streamableValue.update(value);
        }
        // Lock the value again.
        streamableValue[STREAMABLE_VALUE_INTERNAL_LOCK] = true;
      }

      streamableValue[STREAMABLE_VALUE_INTERNAL_LOCK] = false;
      streamableValue.done();
    } catch (e) {
      streamableValue[STREAMABLE_VALUE_INTERNAL_LOCK] = false;
      streamableValue.error(e);
    }
  })();

  return streamableValue;
}

function createStreamableValueImpl<T = any, E = any>(initialValue?: T) {
  let closed = false;
  let locked = false;
  let resolvable = createResolvablePromise<StreamableValue<T, E>>();

  let currentValue = initialValue;
  let currentError: E | undefined;
  let currentPromise: typeof resolvable.promise | undefined =
    resolvable.promise;
  let currentPatchValue: StreamablePatch;

  function assertStream(method: string) {
    if (closed) {
      throw new Error(method + ': Value stream is already closed.');
    }
    if (locked) {
      throw new Error(
        method + ': Value stream is locked and cannot be updated.',
      );
    }
  }

  let warningTimeout: NodeJS.Timeout | undefined;
  function warnUnclosedStream() {
    if (process.env.NODE_ENV === 'development') {
      if (warningTimeout) {
        clearTimeout(warningTimeout);
      }
      warningTimeout = setTimeout(() => {
        console.warn(
          'The streamable UI has been slow to update. This may be a bug or a performance issue or you forgot to call `.done()`.',
        );
      }, DEV_DEFAULT_STREAMABLE_WARNING_TIME);
    }
  }
  warnUnclosedStream();

  function createWrapped(initialChunk?: boolean): StreamableValue<T, E> {
    // This makes the payload much smaller if there're mutative updates before the first read.
    let init: Partial<StreamableValue<T, E>>;

    if (currentError !== undefined) {
      init = { error: currentError };
    } else {
      if (currentPatchValue && !initialChunk) {
        init = { diff: currentPatchValue };
      } else {
        init = { curr: currentValue };
      }
    }

    if (currentPromise) {
      init.next = currentPromise;
    }

    if (initialChunk) {
      init.type = STREAMABLE_VALUE_TYPE;
    }

    return init;
  }

  // Update the internal `currentValue` and `currentPatchValue` if needed.
  function updateValueStates(value: T) {
    // If we can only send a patch over the wire, it's better to do so.
    currentPatchValue = undefined;
    if (typeof value === 'string') {
      if (typeof currentValue === 'string') {
        if (value.startsWith(currentValue)) {
          currentPatchValue = [0, value.slice(currentValue.length)];
        }
      }
    }

    currentValue = value;
  }

  return {
    /**
     * @internal This is an internal lock to prevent the value from being
     * updated by the user.
     */
    set [STREAMABLE_VALUE_INTERNAL_LOCK](state: boolean) {
      locked = state;
    },
    /**
     * The value of the streamable. This can be returned from a Server Action and
     * received by the client. To read the streamed values, use the
     * `readStreamableValue` or `useStreamableValue` APIs.
     */
    get value() {
      return createWrapped(true);
    },
    /**
     * This method updates the current value with a new one.
     */
    update(value: T) {
      assertStream('.update()');

      const resolvePrevious = resolvable.resolve;
      resolvable = createResolvablePromise();

      updateValueStates(value);
      currentPromise = resolvable.promise;
      resolvePrevious(createWrapped());

      warnUnclosedStream();
    },
    /**
     * This method is used to append a delta string to the current value. It
     * requires the current value of the streamable to be a string.
     *
     * @example
     * ```jsx
     * const streamable = createStreamableValue('hello');
     * streamable.append(' world');
     *
     * // The value will be 'hello world'
     * ```
     */
    append(value: T) {
      assertStream('.append()');

      if (
        typeof currentValue !== 'string' &&
        typeof currentValue !== 'undefined'
      ) {
        throw new Error(
          `.append(): The current value is not a string. Received: ${typeof currentValue}`,
        );
      }
      if (typeof value !== 'string') {
        throw new Error(
          `.append(): The value is not a string. Received: ${typeof value}`,
        );
      }

      const resolvePrevious = resolvable.resolve;
      resolvable = createResolvablePromise();

      if (typeof currentValue === 'string') {
        currentPatchValue = [0, value];
        (currentValue as string) = currentValue + value;
      } else {
        currentPatchValue = undefined;
        currentValue = value;
      }

      currentPromise = resolvable.promise;
      resolvePrevious(createWrapped());

      warnUnclosedStream();
    },
    /**
     * This method is used to signal that there is an error in the value stream.
     * It will be thrown on the client side when consumed via
     * `readStreamableValue` or `useStreamableValue`.
     */
    error(error: any) {
      assertStream('.error()');

      if (warningTimeout) {
        clearTimeout(warningTimeout);
      }
      closed = true;
      currentError = error;
      currentPromise = undefined;

      resolvable.resolve({ error });
    },
    /**
     * This method marks the value as finalized. You can either call it without
     * any parameters or with a new value as the final state.
     * Once called, the value cannot be updated or appended anymore.
     *
     * This method is always **required** to be called, otherwise the response
     * will be stuck in a loading state.
     */
    done(...args: [] | [T]) {
      assertStream('.done()');

      if (warningTimeout) {
        clearTimeout(warningTimeout);
      }
      closed = true;
      currentPromise = undefined;

      if (args.length) {
        updateValueStates(args[0]);
        resolvable.resolve(createWrapped());
        return;
      }

      resolvable.resolve({});
    },
  };
}

export { createStreamableUI, createStreamableValue };

type Streamable = ReactNode | Promise<ReactNode>;
type Renderer<T> = (
  props: T,
) =>
  | Streamable
  | Generator<Streamable, Streamable, void>
  | AsyncGenerator<Streamable, Streamable, void>;

/**
 * `render` is a helper function to create a streamable UI from some LLMs.
 * This API only supports OpenAI's GPT models with Function Calling and Assistants Tools,
 * please use `streamUI` for compatibility with other providers.
 *
 * @deprecated It's recommended to use the `streamUI` API for compatibility with AI SDK Core APIs
 * and future features. This API will be removed in a future release.
 */
export function render<
  TS extends {
    [name: string]: z.Schema;
  } = {},
  FS extends {
    [name: string]: z.Schema;
  } = {},
>(options: {
  /**
   * The model name to use. Must be OpenAI SDK compatible. Tools and Functions are only supported
   * GPT models (3.5/4), OpenAI Assistants, Mistral small and large, and Fireworks firefunction-v1.
   *
   * @example "gpt-3.5-turbo"
   */
  model: string;
  /**
   * The provider instance to use. Currently the only provider available is OpenAI.
   * This needs to match the model name.
   */
  provider: OpenAI;
  messages: Parameters<
    typeof OpenAI.prototype.chat.completions.create
  >[0]['messages'];
  text?: Renderer<{
    /**
     * The full text content from the model so far.
     */
    content: string;
    /**
     * The new appended text content from the model since the last `text` call.
     */
    delta: string;
    /**
     * Whether the model is done generating text.
     * If `true`, the `content` will be the final output and this call will be the last.
     */
    done: boolean;
  }>;
  tools?: {
    [name in keyof TS]: {
      description?: string;
      parameters: TS[name];
      render: Renderer<z.infer<TS[name]>>;
    };
  };
  functions?: {
    [name in keyof FS]: {
      description?: string;
      parameters: FS[name];
      render: Renderer<z.infer<FS[name]>>;
    };
  };
  initial?: ReactNode;
  temperature?: number;
}): ReactNode {
  const ui = createStreamableUI(options.initial);

  // The default text renderer just returns the content as string.
  const text = options.text
    ? options.text
    : ({ content }: { content: string }) => content;

  const functions = options.functions
    ? Object.entries(options.functions).map(
        ([name, { description, parameters }]) => {
          return {
            name,
            description,
            parameters: zodToJsonSchema(parameters) as Record<string, unknown>,
          };
        },
      )
    : undefined;

  const tools = options.tools
    ? Object.entries(options.tools).map(
        ([name, { description, parameters }]) => {
          return {
            type: 'function' as const,
            function: {
              name,
              description,
              parameters: zodToJsonSchema(parameters) as Record<
                string,
                unknown
              >,
            },
          };
        },
      )
    : undefined;

  if (functions && tools) {
    throw new Error(
      "You can't have both functions and tools defined. Please choose one or the other.",
    );
  }

  let finished: Promise<void> | undefined;

  async function handleRender(
    args: any,
    renderer: undefined | Renderer<any>,
    res: ReturnType<typeof createStreamableUI>,
  ) {
    if (!renderer) return;

    const resolvable = createResolvablePromise<void>();

    if (finished) {
      finished = finished.then(() => resolvable.promise);
    } else {
      finished = resolvable.promise;
    }

    const value = renderer(args);
    if (
      value instanceof Promise ||
      (value &&
        typeof value === 'object' &&
        'then' in value &&
        typeof value.then === 'function')
    ) {
      const node = await (value as Promise<React.ReactNode>);
      res.update(node);
      resolvable.resolve(void 0);
    } else if (
      value &&
      typeof value === 'object' &&
      Symbol.asyncIterator in value
    ) {
      const it = value as AsyncGenerator<
        React.ReactNode,
        React.ReactNode,
        void
      >;
      while (true) {
        const { done, value } = await it.next();
        res.update(value);
        if (done) break;
      }
      resolvable.resolve(void 0);
    } else if (value && typeof value === 'object' && Symbol.iterator in value) {
      const it = value as Generator<React.ReactNode, React.ReactNode, void>;
      while (true) {
        const { done, value } = it.next();
        res.update(value);
        if (done) break;
      }
      resolvable.resolve(void 0);
    } else {
      res.update(value);
      resolvable.resolve(void 0);
    }
  }

  (async () => {
    let hasFunction = false;
    let content = '';

    consumeStream(
      OpenAIStream(
        (await options.provider.chat.completions.create({
          model: options.model,
          messages: options.messages,
          temperature: options.temperature,
          stream: true,
          ...(functions
            ? {
                functions,
              }
            : {}),
          ...(tools
            ? {
                tools,
              }
            : {}),
        })) as any,
        {
          ...(functions
            ? {
                async experimental_onFunctionCall(functionCallPayload) {
                  hasFunction = true;
                  handleRender(
                    functionCallPayload.arguments,
                    options.functions?.[functionCallPayload.name as any]
                      ?.render,
                    ui,
                  );
                },
              }
            : {}),
          ...(tools
            ? {
                async experimental_onToolCall(toolCallPayload: any) {
                  hasFunction = true;

                  // TODO: We might need Promise.all here?
                  for (const tool of toolCallPayload.tools) {
                    handleRender(
                      tool.func.arguments,
                      options.tools?.[tool.func.name as any]?.render,
                      ui,
                    );
                  }
                },
              }
            : {}),
          onText(chunk) {
            content += chunk;
            handleRender({ content, done: false, delta: chunk }, text, ui);
          },
          async onFinal() {
            if (hasFunction) {
              await finished;
              ui.done();
              return;
            }

            handleRender({ content, done: true }, text, ui);
            await finished;
            ui.done();
          },
        },
      ),
    );
  })();

  return ui.value;
}
