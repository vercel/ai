import type OpenAI from 'openai';
import type { ReactNode } from 'react';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { OpenAIStream } from '../streams';
import { consumeStream } from '../util/consume-stream';
import { createResolvablePromise } from '../util/create-resolvable-promise';
import { createStreamableUI } from './streamable';

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
