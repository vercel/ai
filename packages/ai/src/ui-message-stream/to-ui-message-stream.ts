import type { ToolSet } from '@ai-sdk/provider-utils';
import type {
  TextStreamPart,
  UIMessageStreamOptions,
} from '../generate-text/stream-text-result';
import { logWarnings } from '../logger/log-warnings';
import type { UIMessage } from '../ui/ui-messages';
import { getModelToolErrorText } from './get-model-tool-error-text';
import { getResponseUIMessageId } from './get-response-ui-message-id';
import { handleUIMessageStreamFinish } from './handle-ui-message-stream-finish';
import type { InferUIMessageChunk, UIMessageChunk } from './ui-message-chunks';
import type { UIMessageStreamOutcome } from './ui-message-stream-outcome';
import { toUIMessageChunk } from './to-ui-message-chunk';

/**
 * Converts a stream of `TextStreamPart<TOOLS>` chunks (as emitted by
 * `streamText`'s `stream`) into a stream of `UIMessageChunk`s suitable for
 * UI message streaming, including response message ID injection and
 * step and stream end callbacks.
 */
export function toUIMessageStream<
  TOOLS extends ToolSet = ToolSet,
  UI_MESSAGE extends UIMessage = UIMessage,
>({
  stream,
  tools,
  sendReasoning = true,
  sendSources = false,
  sendStart = true,
  sendFinish = true,
  onError,
  redactToolErrors,
  messageMetadata,
  originalMessages,
  generateMessageId,
  onStepEnd,
  onStepFinish,
  onEnd,
  onFinish,
}: {
  stream: ReadableStream<TextStreamPart<TOOLS>>;
  tools?: TOOLS;
} & UIMessageStreamOptions<UI_MESSAGE>): ReadableStream<
  InferUIMessageChunk<UI_MESSAGE>
> {
  let outcome: UIMessageStreamOutcome = { status: 'unknown' };
  let hasFatalFailure = false;

  // streamText follows each invalid tool call with a tool-error part so the
  // model receives a tool result. The tool-input-error chunk already reports
  // the failure, so the tool-error is skipped to avoid a second onError call.
  // TODO AI SDK 8: remove once invalid tool calls no longer inject tool-error parts
  const invalidToolCallIds = new Set<string>();

  // When tool errors are redacted (`redactToolErrors`, or a custom `onError`),
  // a failed tool call has two error texts: the model receives
  // `getErrorMessage(error)` with the next step, and the UI receives the
  // `onError` result. Reasoning from a later step was produced after the model
  // read its text, so UI messages that contain both no longer reproduce the
  // history that this reasoning belongs to.
  let mismatchedToolCallIdInCurrentStep: string | undefined;
  let mismatchedToolCallIdInEarlierStep: string | undefined;
  let hasWarnedAboutToolErrorMismatch = false;

  const setSourceOutcome = (newOutcome: UIMessageStreamOutcome) => {
    if (
      !hasFatalFailure &&
      outcome.status !== 'completed' &&
      outcome.status !== 'aborted' &&
      newOutcome.status !== 'unknown' &&
      (outcome.status === 'unknown' || newOutcome.status !== 'failed')
    ) {
      outcome = newOutcome;
    }
  };

  const failOutcome = (error: unknown) => {
    hasFatalFailure = true;
    outcome = { status: 'failed', error };
  };

  const responseMessageId =
    generateMessageId != null
      ? getResponseUIMessageId({
          originalMessages,
          responseMessageId: generateMessageId,
        })
      : undefined;

  const sourceReader = stream.getReader();
  let sourceReaderReleased = false;
  let sourceStreamCancelled = false;

  const releaseSourceReader = () => {
    if (!sourceReaderReleased) {
      sourceReader.releaseLock();
      sourceReaderReleased = true;
    }
  };

  const sourceStream = new ReadableStream<TextStreamPart<TOOLS>>({
    async pull(controller) {
      try {
        const { done, value } = await sourceReader.read();

        if (done) {
          releaseSourceReader();
          if (!sourceStreamCancelled) {
            controller.close();
          }
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        releaseSourceReader();
        if (!sourceStreamCancelled) {
          failOutcome(error);
          controller.error(error);
        }
      }
    },

    async cancel(reason) {
      sourceStreamCancelled = true;
      if (sourceReaderReleased) {
        return;
      }

      try {
        await sourceReader.cancel(reason);
      } finally {
        releaseSourceReader();
      }
    },
  });

  const uiMessageChunkStream = sourceStream.pipeThrough(
    new TransformStream({
      transform: async (part, controller) => {
        try {
          if (part.type === 'tool-call' && part.invalid) {
            invalidToolCallIds.add(part.toolCallId);
          }

          const isInvalidToolCallError =
            part.type === 'tool-error' &&
            !part.providerExecuted &&
            invalidToolCallIds.delete(part.toolCallId);

          const messageMetadataValue = messageMetadata?.({ part });

          const uiMessageChunk = isInvalidToolCallError
            ? undefined
            : toUIMessageChunk(part, {
                tools,
                sendReasoning,
                sendSources,
                sendStart,
                sendFinish,
                onError,
                redactToolErrors,
                messageMetadata: messageMetadataValue,
                responseMessageId,
              });

          if (part.type === 'start-step') {
            // the model receives the tool errors of a step with the next step
            mismatchedToolCallIdInEarlierStep ??=
              mismatchedToolCallIdInCurrentStep;
            mismatchedToolCallIdInCurrentStep = undefined;
          } else if (
            (part.type === 'tool-error' || part.type === 'tool-call') &&
            !part.providerExecuted &&
            (uiMessageChunk?.type === 'tool-output-error' ||
              uiMessageChunk?.type === 'tool-input-error')
          ) {
            const { errorText } = uiMessageChunk as UIMessageChunk & {
              type: 'tool-output-error' | 'tool-input-error';
            };

            const modelErrorText = getModelToolErrorText(part.error);

            if (modelErrorText != null && errorText !== modelErrorText) {
              mismatchedToolCallIdInCurrentStep ??= part.toolCallId;
            }
          } else if (
            uiMessageChunk?.type === 'reasoning-start' &&
            mismatchedToolCallIdInEarlierStep != null &&
            !hasWarnedAboutToolErrorMismatch
          ) {
            hasWarnedAboutToolErrorMismatch = true;
            logWarnings({
              warnings: [
                {
                  type: 'other',
                  message:
                    `The error text sent to the UI for tool call "${mismatchedToolCallIdInEarlierStep}" differs from the error text the model received, ` +
                    'and reasoning from a later step was sent to the UI. ' +
                    'Converting these UI messages back to model messages changes the tool result. ' +
                    'Models that bind reasoning to the preceding messages (for example Anthropic models with preserved thinking) reject that history. ' +
                    'See https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage#tool-error-text-and-message-history',
                },
              ],
            });
          }

          if (uiMessageChunk != null && part.type !== 'finish-step') {
            controller.enqueue(uiMessageChunk);
          }

          // start and finish events already include metadata in the converted
          // chunk; for other part types emit a separate message-metadata chunk
          if (
            messageMetadataValue != null &&
            part.type !== 'start' &&
            part.type !== 'finish'
          ) {
            controller.enqueue({
              type: 'message-metadata',
              messageMetadata: messageMetadataValue,
            });
          }

          // Apply step metadata before the boundary triggers a UI snapshot.
          if (uiMessageChunk != null && part.type === 'finish-step') {
            controller.enqueue(uiMessageChunk);
          }

          if (part.type === 'finish') {
            setSourceOutcome({ status: 'completed' });
          } else if (part.type === 'abort') {
            setSourceOutcome({ status: 'aborted' });
          } else if (part.type === 'error') {
            setSourceOutcome({ status: 'failed', error: part.error });
          }
        } catch (error) {
          failOutcome(error);
          throw error;
        }
      },
    }),
  );

  return handleUIMessageStreamFinish({
    stream: uiMessageChunkStream,
    messageId: responseMessageId ?? generateMessageId?.(),
    originalMessages,
    onStepEnd: onStepEnd ?? onStepFinish,
    onEnd: onEnd ?? onFinish,
    onError: onError ?? (() => 'An error occurred.'),
    getOutcome: () => outcome,
  });
}
