import type { ParseResult } from '@ai-sdk/provider-utils';
import type { GoogleInteractionsEvent } from './google-interactions-api';
import { GoogleInteractionsContinuationError } from './google-interactions-continuation-error';

type Event = ParseResult<GoogleInteractionsEvent>;
const MAX_RECONNECTS_WITHOUT_PROGRESS = 3;

/** Concatenate foreground POST streams, resuming only at safe checkpoints. */
export function continueGoogleInteractionsStream({
  stream,
  continueStream,
  abortSignal,
  store,
}: {
  stream: ReadableStream<Event>;
  continueStream: (
    token: string,
    tokenOwnerId: string | undefined,
    signal: AbortSignal,
  ) => Promise<ReadableStream<Event>>;
  abortSignal?: AbortSignal;
  store?: boolean;
}): ReadableStream<Event> {
  let reader = stream.getReader();
  let interactionId: string | undefined;
  let token: string | undefined;
  let tokenOwnerId: string | undefined;
  let startToken: string | undefined;
  let status: string | undefined;
  let contentSinceCheckpoint = false;
  let reconnectsWithoutProgress = 0;
  let cancelled = false;
  const completedTokens = new Set<string>();
  const internalAbort = new AbortController();
  const abort = () => internalAbort.abort(abortSignal?.reason);
  if (abortSignal?.aborted) abort();
  else abortSignal?.addEventListener('abort', abort, { once: true });

  function cleanup() {
    abortSignal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }

  function fail(
    controller: ReadableStreamDefaultController<Event>,
    cause: unknown,
  ) {
    const error =
      token != null || status === 'requires_continuation'
        ? new GoogleInteractionsContinuationError({
            cause,
            continuationToken: token,
            interactionId: store === false ? undefined : tokenOwnerId,
          })
        : cause;
    controller.enqueue({
      success: false,
      error: error as Extract<Event, { success: false }>['error'],
      rawValue: undefined,
    });
    controller.close();
    reader.cancel().catch(() => {});
    cleanup();
  }

  return new ReadableStream<Event>({
    async pull(controller) {
      while (true) {
        if (cancelled) return;
        let disconnect: unknown;
        try {
          internalAbort.signal.throwIfAborted();
          const { done, value } = await reader.read();
          if (!done) {
            if (!value.success) {
              // Parsing errors cannot be retried as transport disconnects.
              if (token != null) {
                fail(controller, value.error);
                return;
              }
              status = 'failed';
              token = undefined;
            } else {
              const event = value.value as {
                event_type: string;
                status?: string;
                continuation_token?: string | null;
                interaction_id?: string | null;
                interaction?: {
                  id?: string | null;
                  status?: string | null;
                  continuation_token?: string | null;
                };
              };
              const id = event.interaction?.id || event.interaction_id;
              if (id) interactionId = id;
              const nextStatus =
                event.interaction?.status ??
                event.status ??
                (event.event_type === 'interaction.requires_action'
                  ? 'requires_action'
                  : event.event_type === 'interaction.in_progress'
                    ? 'in_progress'
                    : undefined);
              if (nextStatus != null) status = nextStatus;
              const nextToken =
                event.interaction?.continuation_token ??
                event.continuation_token;
              if (event.event_type === 'interaction.completed') {
                // The final snapshot clears stale checkpoint tokens.
                if (nextToken && nextToken !== token)
                  tokenOwnerId = interactionId;
                token = nextToken || undefined;
                contentSinceCheckpoint = false;
              } else if (event.event_type === 'interaction.status_update') {
                if (nextToken) {
                  if (nextToken !== token) tokenOwnerId = interactionId;
                  token = nextToken;
                  contentSinceCheckpoint = false;
                }
              } else if (event.event_type === 'error') {
                status = 'failed';
                token = undefined;
              } else if (event.event_type !== 'interaction.created') {
                // Includes step boundaries and tool output, not just text deltas.
                contentSinceCheckpoint = true;
              }
            }
            controller.enqueue(value);
            return;
          }
        } catch (error) {
          disconnect = error;
        }

        if (cancelled) return;
        if (internalAbort.signal.aborted) {
          fail(controller, internalAbort.signal.reason);
          return;
        }
        const resumable =
          status == null ||
          status === 'in_progress' ||
          status === 'requires_continuation';
        if (!resumable) {
          if (disconnect != null) fail(controller, disconnect);
          else {
            controller.close();
            cleanup();
          }
          return;
        }
        if (token == null || contentSinceCheckpoint) {
          if (
            disconnect != null ||
            token != null ||
            status === 'requires_continuation'
          ) {
            fail(
              controller,
              disconnect ??
                new Error(
                  'google.interactions: stream ended before continuation could finish safely.',
                ),
            );
          } else {
            controller.close();
            cleanup();
          }
          return;
        }
        if (status === 'requires_continuation') {
          if (completedTokens.has(token)) {
            fail(
              controller,
              new Error(
                'google.interactions: continuation returned a repeated token.',
              ),
            );
            return;
          }
          completedTokens.add(token);
        }
        reconnectsWithoutProgress =
          token !== startToken ? 0 : reconnectsWithoutProgress + 1;
        if (reconnectsWithoutProgress > MAX_RECONNECTS_WITHOUT_PROGRESS) {
          fail(
            controller,
            disconnect ??
              new Error(
                'google.interactions: continuation reconnects made no progress.',
              ),
          );
          return;
        }

        try {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
          const next = await continueStream(
            token,
            tokenOwnerId,
            internalAbort.signal,
          );
          reader = next.getReader();
          if (cancelled) {
            await reader.cancel();
            cleanup();
            return;
          }
          startToken = token;
          // The seed token still belongs to its original hop until a new
          // checkpoint arrives, even after interaction.created gives a new id.
          interactionId = undefined;
          status = undefined;
          contentSinceCheckpoint = false;
        } catch (error) {
          if (!cancelled) fail(controller, error);
          return;
        }
      }
    },
    async cancel(reason) {
      cancelled = true;
      internalAbort.abort(reason);
      await reader.cancel(reason).catch(() => {});
      abortSignal?.removeEventListener('abort', abort);
    },
  });
}
