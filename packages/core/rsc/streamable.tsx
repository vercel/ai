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
import type { StreamableValue } from './types';

/**
 * Create a piece of changable UI that can be streamed to the client.
 * On the client side, it can be rendered as a normal React node.
 */
export function createStreamableUI(initialValue?: React.ReactNode) {
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
    value: row,
    update(value: React.ReactNode) {
      assertStream('.update()');

      const resolvable = createResolvablePromise();
      currentValue = value;

      resolve({ value: currentValue, done: false, next: resolvable.promise });
      resolve = resolvable.resolve;
      reject = resolvable.reject;

      warnUnclosedStream();
    },
    append(value: React.ReactNode) {
      assertStream('.append()');

      const resolvable = createResolvablePromise();
      if (typeof currentValue === 'string' && typeof value === 'string') {
        currentValue += value;
      } else {
        currentValue = (
          <>
            {currentValue}
            {value}
          </>
        );
      }

      resolve({ value: currentValue, done: false, next: resolvable.promise });
      resolve = resolvable.resolve;
      reject = resolvable.reject;

      warnUnclosedStream();
    },
    error(error: any) {
      assertStream('.error()');

      if (warningTimeout) {
        clearTimeout(warningTimeout);
      }
      closed = true;
      reject(error);
    },
    done(...args: any) {
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

/**
 * Create a wrapped, changable value that can be streamed to the client.
 * On the client side, the value can be accessed via the readStreamableValue() API.
 */
export function createStreamableValue<T = any, E = any>(initialValue?: T) {
  let closed = false;
  let { promise, resolve } = createResolvablePromise<StreamableValue<T, E>>();

  function assertStream(method: string) {
    if (closed) {
      throw new Error(method + ': Value stream is already closed.');
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

  function createWrapped(
    val: T | undefined,
    initial?: boolean,
  ): StreamableValue<T, E> {
    if (initial) {
      return {
        type: STREAMABLE_VALUE_TYPE,
        curr: val,
        next: promise,
      };
    }

    return {
      curr: val,
      next: promise,
    };
  }

  return {
    value: createWrapped(initialValue, true),
    update(value: T) {
      assertStream('.update()');

      const resolvePrevious = resolve;
      const resolvable = createResolvablePromise();
      promise = resolvable.promise;
      resolve = resolvable.resolve;

      resolvePrevious(createWrapped(value));

      warnUnclosedStream();
    },
    error(error: any) {
      assertStream('.error()');

      if (warningTimeout) {
        clearTimeout(warningTimeout);
      }
      closed = true;
      resolve({ error });
    },
    done(...args: any) {
      assertStream('.done()');

      if (warningTimeout) {
        clearTimeout(warningTimeout);
      }
      closed = true;

      if (args.length) {
        resolve({ curr: args[0] });
        return;
      }

      resolve({});
    },
  };
}

type Streamable = ReactNode | Promise<ReactNode>;
type Renderer<T> = (
  props: T,
) =>
  | Streamable
  | Generator<Streamable, Streamable, void>
  | AsyncGenerator<Streamable, Streamable, void>;

/**
 * `render` is a helper function to create a streamable UI from some LLMs.
 * Currently, it only supports OpenAI's GPT models with Function Calling and Assistants Tools.
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
  text?: Renderer<{ content: string; done: boolean }>;
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
            handleRender({ content, done: false }, text, ui);
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
