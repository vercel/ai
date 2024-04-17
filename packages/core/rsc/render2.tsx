import { LanguageModelV1 } from '@ai-sdk/provider';
import { ReactNode } from 'react';
import { z } from 'zod';
import { CallSettings } from '../core/prompt/call-settings';
import { convertToLanguageModelPrompt } from '../core/prompt/convert-to-language-model-prompt';
import { getValidatedPrompt } from '../core/prompt/get-validated-prompt';
import { prepareCallSettings } from '../core/prompt/prepare-call-settings';
import { Prompt } from '../core/prompt/prompt';
import { convertZodToJSONSchema } from '../core/util/convert-zod-to-json-schema';
import { retryWithExponentialBackoff } from '../core/util/retry-with-exponential-backoff';
import { createStreamableUI } from './streamable';
import { createResolvablePromise } from './utils';

type Streamable = ReactNode | Promise<ReactNode>;
type Renderer<T> = (
  props: T,
) =>
  | Streamable
  | Generator<Streamable, Streamable, void>
  | AsyncGenerator<Streamable, Streamable, void>;

type RenderTool<PARAMETERS extends z.ZodTypeAny = any> = {
  description?: string;
  parameters: PARAMETERS;
  execute?: (
    args: z.infer<PARAMETERS>,
  ) =>
    | Streamable
    | Generator<Streamable, Streamable, void>
    | AsyncGenerator<Streamable, Streamable, void>;
};

export function render2<TOOLS extends Record<string, RenderTool>>({
  model,
  tools,
  system,
  prompt,
  messages,
  maxRetries,
  abortSignal,
  initial,
  text,
  ...settings
}: CallSettings &
  Prompt & {
    /**
  The language model to use.
       */
    model: LanguageModelV1;

    /**
  The tools that the model can call. The model needs to support calling tools.
      */
    tools?: TOOLS;

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

    initial?: ReactNode;
  }): ReactNode {
  const ui = createStreamableUI(initial);

  // The default text renderer just returns the content as string.
  text ??= ({ content }: { content: string }) => content;

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
    const retry = retryWithExponentialBackoff({ maxRetries });
    const validatedPrompt = getValidatedPrompt({ system, prompt, messages });
    const { stream, warnings } = await retry(() =>
      model.doStream({
        mode: {
          type: 'regular',
          tools:
            tools == null
              ? undefined
              : Object.entries(tools).map(([name, tool]) => ({
                  type: 'function',
                  name,
                  description: tool.description,
                  parameters: convertZodToJSONSchema(tool.parameters),
                })),
        },
        ...prepareCallSettings(settings),
        inputFormat: validatedPrompt.type,
        prompt: convertToLanguageModelPrompt(validatedPrompt),
        abortSignal,
      }),
    );

    // consume stream as ReadableStream:
    const reader = stream.getReader();

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      const type = value.type;
      switch (type) {
        case 'text-delta': {
          // TODO text handling
          break;
        }

        case 'tool-call': {
          // TODO call tool and render
          break;
        }

        case 'tool-call-delta': {
          // ignored
          break;
        }

        case 'error': {
          // TODO
          break;
        }

        case 'finish': {
          // TODO can close if all tools are done
          break;
        }

        default: {
          const exhaustivenessCheck: never = type;
          throw new Error(`Unhandled type: ${exhaustivenessCheck}`);
        }
      }
    }
  })();

  return ui.value;
}
