import {
  InvalidToolArgumentsError,
  LanguageModelV1,
  NoSuchToolError,
} from '@ai-sdk/provider';
import { ReactNode } from 'react';
import { z } from 'zod';

import { CallSettings } from '../../core/prompt/call-settings';
import { Prompt } from '../../core/prompt/prompt';
import { createStreamableUI } from '../streamable';
import { retryWithExponentialBackoff } from '../../core/util/retry-with-exponential-backoff';
import { getValidatedPrompt } from '../../core/prompt/get-validated-prompt';
import { convertZodToJSONSchema } from '../../core/util/convert-zod-to-json-schema';
import { prepareCallSettings } from '../../core/prompt/prepare-call-settings';
import { convertToLanguageModelPrompt } from '../../core/prompt/convert-to-language-model-prompt';
import { createResolvablePromise } from '../utils';
import { safeParseJSON } from '@ai-sdk/provider-utils';

type Streamable = ReactNode | Promise<ReactNode>;

type Renderer<T extends Array<any>> = (
  ...args: T
) =>
  | Streamable
  | Generator<Streamable, Streamable, void>
  | AsyncGenerator<Streamable, Streamable, void>;

type RenderTool<PARAMETERS extends z.ZodTypeAny = any> = {
  description?: string;
  parameters: PARAMETERS;
  generate?: Renderer<
    [
      z.infer<PARAMETERS>,
      {
        toolName: string;
        toolCallId: string;
      },
    ]
  >;
};

type RenderText = Renderer<
  [
    {
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
    },
  ]
>;

type RenderResult = {
  value: ReactNode;
} & Awaited<ReturnType<LanguageModelV1['doStream']>>;

const defaultTextRenderer: RenderText = ({ content }: { content: string }) =>
  content;

/**
 * `streamUI` is a helper function to create a streamable UI from LLMs.
 */
export async function streamUI<
  TOOLS extends { [name: string]: z.ZodTypeAny } = {},
>({
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
     * The language model to use.
     */
    model: LanguageModelV1;

    /**
     * The tools that the model can call. The model needs to support calling tools.
     */
    tools?: {
      [name in keyof TOOLS]: RenderTool<TOOLS[name]>;
    };

    text?: RenderText;
    initial?: ReactNode;
  }): Promise<RenderResult> {
  // TODO: Remove these errors after the experimental phase.
  if (typeof model === 'string') {
    throw new Error(
      '`model` cannot be a string in `streamUI`. Use the actual model instance instead.',
    );
  }
  if ('functions' in settings) {
    throw new Error(
      '`functions` is not supported in `streamUI`, use `tools` instead.',
    );
  }
  if ('provider' in settings) {
    throw new Error(
      '`provider` is no longer needed in `streamUI`. Use `model` instead.',
    );
  }
  if (tools) {
    for (const [name, tool] of Object.entries(tools)) {
      if ('render' in tool) {
        throw new Error(
          'Tool definition in `streamUI` should not have `render` property. Use `generate` instead. Found in tool: ' +
            name,
        );
      }
    }
  }

  const ui = createStreamableUI(initial);

  // The default text renderer just returns the content as string.
  const textRender = text || defaultTextRenderer;

  let finished: Promise<void> | undefined;

  async function handleRender(
    args: [payload: any] | [payload: any, options: any],
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

    const value = renderer(...args);
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

  const retry = retryWithExponentialBackoff({ maxRetries });
  const validatedPrompt = getValidatedPrompt({ system, prompt, messages });
  const result = await retry(() =>
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

  const [stream, forkedStream] = result.stream.tee();

  (async () => {
    try {
      // Consume the forked stream asynchonously.

      let content = '';
      let hasToolCall = false;

      const reader = forkedStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        switch (value.type) {
          case 'text-delta': {
            content += value.textDelta;
            handleRender(
              [{ content, done: false, delta: value.textDelta }],
              textRender,
              ui,
            );
            break;
          }

          case 'tool-call-delta': {
            hasToolCall = true;
            break;
          }

          case 'tool-call': {
            const toolName = value.toolName as keyof TOOLS & string;

            if (!tools) {
              throw new NoSuchToolError({ toolName: toolName });
            }

            const tool = tools[toolName];
            if (!tool) {
              throw new NoSuchToolError({
                toolName,
                availableTools: Object.keys(tools),
              });
            }

            const parseResult = safeParseJSON({
              text: value.args,
              schema: tool.parameters,
            });

            if (parseResult.success === false) {
              throw new InvalidToolArgumentsError({
                toolName,
                toolArgs: value.args,
                cause: parseResult.error,
              });
            }

            handleRender(
              [
                parseResult.value,
                {
                  toolName,
                  toolCallId: value.toolCallId,
                },
              ],
              tool.generate,
              ui,
            );

            break;
          }

          case 'error': {
            throw value.error;
          }

          case 'finish': {
            // Nothing to do here.
          }
        }
      }

      if (hasToolCall) {
        await finished;
        ui.done();
      } else {
        handleRender([{ content, done: true }], textRender, ui);
        await finished;
        ui.done();
      }
    } catch (error) {
      // During the stream rendering, we don't want to throw the error to the
      // parent scope but only let the React's error boundary to catch it.
      ui.error(error);
    }
  })();

  return {
    ...result,
    stream,
    value: ui.value,
  };
}
