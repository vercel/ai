import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1PromptControl,
  type HarnessV1PromptTurnOptions,
  type HarnessV1ResumeSessionState,
  type HarnessV1Session,
} from '@ai-sdk/harness';
import { parkJcodeClient, type JcodeSdkClient } from './jcode-client';
import {
  createJcodeTranslatorState,
  translateJcodeEvent,
} from './jcode-translate';
import { extractJcodePrompt, frameJcodeInstructions } from './jcode-utils';

const HARNESS_ID = 'jcode';

export interface CreateJcodeSessionInput {
  readonly client: JcodeSdkClient;
  readonly sessionId: string;
  readonly sessionWorkDir: string;
  readonly resumeJcodeSessionId?: string;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly abortSignal?: AbortSignal;
}

function unsupported(message: string): HarnessCapabilityUnsupportedError {
  return new HarnessCapabilityUnsupportedError({
    harnessId: HARNESS_ID,
    message: `jcode: ${message}`,
  });
}

export async function createJcodeSession({
  client,
  sessionId,
  sessionWorkDir,
  resumeJcodeSessionId,
  model,
  reasoningEffort,
  abortSignal,
}: CreateJcodeSessionInput): Promise<HarnessV1Session> {
  if (abortSignal?.aborted) {
    await client.close();
    throw abortSignal.reason;
  }

  let jcodeSessionId: string;
  try {
    const nativeSession = resumeJcodeSessionId
      ? await client.attachSession(resumeJcodeSessionId)
      : await client.createSession(sessionWorkDir);
    jcodeSessionId = nativeSession.session_id;
    if (model) await client.setModel(jcodeSessionId, model);
    if (reasoningEffort) {
      await client.setReasoningEffort(jcodeSessionId, reasoningEffort);
    }
  } catch (error) {
    await client.close();
    throw error;
  }

  let closed = false;
  let activeCancel: (() => Promise<void>) | undefined;
  let activeDone: PromiseLike<void> | undefined;
  let isFirstPrompt = resumeJcodeSessionId == null;

  const lifecycleData = () => ({
    jcodeSessionId,
    ...(client.instanceHome ? { jcodeHome: client.instanceHome } : {}),
  });

  const assertOpen = () => {
    if (closed) throw new Error('jcode harness session is closed');
  };

  const runTurn = async (
    options: HarnessV1PromptTurnOptions,
  ): Promise<HarnessV1PromptControl> => {
    assertOpen();
    if (activeCancel) throw new Error('a Jcode turn is already active');
    if (options.responseFormat?.type === 'json') {
      throw unsupported('JSON response format is not supported yet');
    }
    if (options.tools && options.tools.length > 0) {
      throw unsupported(
        'host-defined tools require session-scoped MCP support in Jcode',
      );
    }

    let prompt = extractJcodePrompt(options.prompt);
    if (isFirstPrompt && options.instructions) {
      prompt = frameJcodeInstructions(options.instructions, prompt);
    }
    isFirstPrompt = false;

    const iterator = client.events(jcodeSessionId);
    const state = createJcodeTranslatorState();
    options.emit({
      type: 'stream-start',
      ...(model ? { modelId: model } : {}),
    });

    let settled = false;
    let cancelPromise: Promise<void> | undefined;
    let abortListener: (() => void) | undefined;
    const cancel = async () => {
      if (settled) return;
      cancelPromise ??= client.cancel(jcodeSessionId);
      await cancelPromise;
    };
    activeCancel = cancel;

    const done = (async () => {
      try {
        if (options.abortSignal) {
          abortListener = () => {
            void cancel().catch(() => {
              // The turn's event stream remains the source of truth. Avoid an
              // unhandled rejection if transport cancellation itself fails.
            });
          };
          options.abortSignal.addEventListener('abort', abortListener, {
            once: true,
          });
          if (options.abortSignal.aborted) await cancel();
        }

        await client.sendMessage(jcodeSessionId, prompt);
        for await (const event of iterator) {
          if (event.ev === 'error') {
            throw new Error(`${event.code}: ${event.message}`);
          }
          for (const part of translateJcodeEvent(event, state)) {
            options.emit(part);
          }
          if (event.ev === 'turn_done') return;
        }
        throw new Error('Jcode event stream closed before turn_done');
      } catch (error) {
        options.emit({ type: 'error', error });
        throw error;
      } finally {
        settled = true;
        activeCancel = undefined;
        activeDone = undefined;
        if (abortListener && options.abortSignal) {
          options.abortSignal.removeEventListener('abort', abortListener);
        }
        await iterator.return?.();
      }
    })();
    activeDone = done;

    return {
      done,
      async submitToolResult() {
        throw unsupported(
          'host tool results require session-scoped MCP support in Jcode',
        );
      },
      async submitUserMessage(text) {
        await client.softInterrupt(jcodeSessionId, text);
      },
    };
  };

  const resumeState = (): HarnessV1ResumeSessionState => ({
    type: 'resume-session',
    harnessId: HARNESS_ID,
    specificationVersion: 'harness-v1',
    data: lifecycleData(),
  });

  return {
    sessionId,
    isResume: resumeJcodeSessionId != null,
    ...(model ? { modelId: model } : {}),
    doPromptTurn: runTurn,
    async doCompact(customInstructions) {
      assertOpen();
      if (customInstructions) {
        throw unsupported('custom compaction instructions are not supported');
      }
      await client.compact(jcodeSessionId);
    },
    async doContinueTurn() {
      throw unsupported(
        'lossless turn continuation requires event replay cursors in the Jcode SDK',
      );
    },
    async doSuspendTurn() {
      throw unsupported(
        'turn suspension requires event replay cursors in the Jcode SDK',
      );
    },
    async doDetach() {
      assertOpen();
      if (activeCancel) {
        throw unsupported(
          'cannot detach while a turn is active; suspend it first',
        );
      }
      await client.detachSession(jcodeSessionId);
      parkJcodeClient(jcodeSessionId, client);
      closed = true;
      return resumeState();
    },
    async doStop() {
      assertOpen();
      if (activeCancel) await activeCancel();
      if (activeDone) await activeDone;
      await client.detachSession(jcodeSessionId);
      const state = resumeState();
      closed = true;
      await client.close();
      return state;
    },
    async doDestroy() {
      if (closed) return;
      if (activeCancel) await activeCancel();
      if (activeDone) {
        try {
          await activeDone;
        } catch {
          // Destruction must still release the owned runtime after turn failure.
        }
      }
      closed = true;
      await client.close();
    },
  };
}
