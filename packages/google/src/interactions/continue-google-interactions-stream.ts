import { delay, isAbortError, type ParseResult } from '@ai-sdk/provider-utils';
import type { GoogleStreamPart } from '../continue-google-stream';
import type { GoogleInteractionsEvent } from './google-interactions-api';
import { GoogleInteractionsContinuationError } from './google-interactions-continuation-error';

export type GoogleInteractionsStreamPart =
  | GoogleStreamPart<GoogleInteractionsEvent>
  | {
      success: false;
      error: GoogleInteractionsContinuationError;
      rawValue: undefined;
    };

/** Chains foreground hops and resumes only when doing so cannot duplicate output. */
export function continueGoogleInteractionsStream({
  stream,
  continueStream,
  initialContinuationToken,
  initialInteractionId,
  abortSignal,
  store,
  maxReconnects = 3,
  retryDelayMs = 500,
}: {
  stream: ReadableStream<ParseResult<GoogleInteractionsEvent>>;
  continueStream: (
    token: string,
    interactionId: string | undefined,
  ) => Promise<ReadableStream<ParseResult<GoogleInteractionsEvent>>>;
  initialContinuationToken?: string;
  initialInteractionId?: string;
  abortSignal?: AbortSignal;
  store?: boolean;
  maxReconnects?: number;
  retryDelayMs?: number;
}): ReadableStream<GoogleInteractionsStreamPart> {
  let reader:
    | ReadableStreamDefaultReader<ParseResult<GoogleInteractionsEvent>>
    | undefined = stream.getReader();
  let startToken = initialContinuationToken;
  let token = initialContinuationToken;
  let tokenOwnerId = store === false ? undefined : initialInteractionId;
  let interactionId: string | undefined;
  let status: string | undefined;
  let contentSinceCheckpoint = false;
  let invalidEvent = false;
  let reconnectsWithoutProgress = 0;
  let cancelled = false;

  return new ReadableStream<GoogleInteractionsStreamPart>({
    async pull(controller) {
      const activeReader = reader;
      if (activeReader == null) return;
      let readError: unknown;
      try {
        const { done, value } = await activeReader.read();
        if (!done) {
          if (value.success) {
            const event = value.value as {
              event_type: string;
              interaction_id?: string | null;
              status?: string | null;
              continuation_token?: string | null;
              interaction?: {
                id?: string | null;
                status?: string | null;
                continuation_token?: string | null;
              } | null;
            };
            const eventId = event.interaction_id ?? event.interaction?.id;
            if (eventId && store !== false) interactionId = eventId;
            status = event.status ?? event.interaction?.status ?? status;
            const nextToken =
              event.continuation_token ?? event.interaction?.continuation_token;
            if (nextToken) {
              if (nextToken !== token) tokenOwnerId = interactionId;
              token = nextToken;
            }

            if (event.event_type === 'interaction.completed') {
              // The terminal snapshot supersedes every earlier checkpoint.
              token = nextToken || undefined;
              contentSinceCheckpoint = false;
            } else if (
              event.event_type === 'interaction.status_update' &&
              nextToken
            ) {
              contentSinceCheckpoint = false;
            } else if (
              event.event_type !== 'interaction.created' &&
              event.event_type !== 'interaction.status_update' &&
              event.event_type !== 'interaction.in_progress'
            ) {
              contentSinceCheckpoint = true;
            }

            if (event.event_type === 'error') {
              status = 'failed';
              token = undefined;
            }
          } else {
            // Invalid SSE must not be hidden by a continuation request.
            invalidEvent = true;
          }
          controller.enqueue(value);
          return;
        }
      } catch (error) {
        if (isAbortError(error) || abortSignal?.aborted) {
          controller.error(error);
          return;
        }
        readError = error;
      }

      if (cancelled) return;
      activeReader.releaseLock();
      reader = undefined;

      const canResume =
        !invalidEvent &&
        token != null &&
        (status == null ||
          status === 'queued' ||
          status === 'in_progress' ||
          status === 'requires_continuation');

      const resumeToken = token;

      if (!canResume || resumeToken == null) {
        if (readError != null) controller.error(readError);
        else controller.close();
        return;
      }

      const interrupt = (cause: unknown) => {
        controller.enqueue({
          success: false,
          error: new GoogleInteractionsContinuationError({
            cause,
            continuationToken: resumeToken,
            interactionId: tokenOwnerId,
          }),
          rawValue: undefined,
        });
        controller.close();
      };

      if (contentSinceCheckpoint) {
        interrupt(
          readError ??
            new Error('Stream ended after output beyond its checkpoint.'),
        );
        return;
      }

      if (token === startToken) reconnectsWithoutProgress++;
      else reconnectsWithoutProgress = 0;

      if (
        reconnectsWithoutProgress > maxReconnects ||
        (status === 'requires_continuation' && token === startToken)
      ) {
        interrupt(readError ?? new Error('Continuation made no progress.'));
        return;
      }

      try {
        if (reconnectsWithoutProgress > 0) {
          await delay(retryDelayMs * reconnectsWithoutProgress, {
            abortSignal,
          });
        }
        if (cancelled) return;
        abortSignal?.throwIfAborted();
        const nextStream = await continueStream(resumeToken, tokenOwnerId);
        reader = nextStream.getReader();
        if (cancelled) {
          await reader.cancel();
          return;
        }
        startToken = token;
        interactionId = undefined;
        status = undefined;
        contentSinceCheckpoint = false;
        invalidEvent = false;
        controller.enqueue({ type: 'continuation-start' });
      } catch (error) {
        if (isAbortError(error) || abortSignal?.aborted)
          controller.error(error);
        else interrupt(error);
      }
    },

    async cancel(reason) {
      cancelled = true;
      await reader?.cancel(reason);
    },
  });
}
