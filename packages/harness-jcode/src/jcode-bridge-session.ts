import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1PromptControl,
  type HarnessV1PromptTurnOptions,
  type HarnessV1ResumeSessionState,
  type HarnessV1Session,
  type HarnessV1StreamPart,
} from '@ai-sdk/harness';
import type { SandboxChannel } from '@ai-sdk/harness/utils';
import type { Experimental_SandboxProcess } from '@ai-sdk/provider-utils';
import type {
  JcodeBridgeInboundMessage,
  JcodeBridgeOutboundMessage,
} from './jcode-bridge-protocol';
import { extractJcodePrompt, frameJcodeInstructions } from './jcode-utils';

export type JcodeBridgeChannel = SandboxChannel<
  JcodeBridgeOutboundMessage,
  JcodeBridgeInboundMessage
>;

export interface CreateJcodeBridgeSessionInput {
  readonly sessionId: string;
  readonly channel: JcodeBridgeChannel;
  readonly proc: Experimental_SandboxProcess;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly resumeJcodeSessionId?: string;
  readonly jcodeHome: string;
}

const unsupported = (message: string) =>
  new HarnessCapabilityUnsupportedError({
    harnessId: 'jcode',
    message: `jcode: ${message}`,
  });

export function createJcodeBridgeSession({
  sessionId,
  channel,
  proc,
  model,
  reasoningEffort,
  resumeJcodeSessionId,
  jcodeHome,
}: CreateJcodeBridgeSessionInput): HarnessV1Session {
  let closed = false;
  let firstPrompt = resumeJcodeSessionId == null;
  let activeDone: Promise<void> | undefined;

  const assertOpen = () => {
    if (closed) throw new Error('jcode harness session is closed');
  };

  const wireTurn = ({
    emit,
    abortSignal,
  }: Pick<
    HarnessV1PromptTurnOptions,
    'emit' | 'abortSignal'
  >): HarnessV1PromptControl => {
    if (activeDone) throw new Error('a Jcode turn is already active');

    let resolveDone!: () => void;
    let rejectDone!: (error: unknown) => void;
    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    activeDone = done;
    let settled = false;
    const unsubs: Array<() => void> = [];

    const settle = (error?: unknown) => {
      if (settled) return;
      settled = true;
      for (const unsubscribe of unsubs) unsubscribe();
      abortSignal?.removeEventListener('abort', onAbort);
      activeDone = undefined;
      error === undefined ? resolveDone() : rejectDone(error);
    };
    const forward = (part: HarnessV1StreamPart) => {
      try {
        emit(part);
      } catch {}
    };
    const eventTypes = [
      'stream-start',
      'text-start',
      'text-delta',
      'text-end',
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'tool-call',
      'tool-result',
      'file-change',
      'finish-step',
      'compaction',
      'raw',
    ] as const;
    for (const type of eventTypes) {
      unsubs.push(channel.on(type, message => forward(message)));
    }
    unsubs.push(
      channel.on('finish', message => {
        forward(message);
        settle();
      }),
      channel.on('error', message => {
        forward(message);
        settle(message.error);
      }),
    );
    channel.onClose((_code, reason) => {
      if (!settled) {
        settle(
          new Error(
            `jcode bridge closed before the turn finished${reason ? `: ${reason}` : ''}`,
          ),
        );
      }
    });

    function onAbort() {
      if (settled) return;
      try {
        channel.send({ type: 'abort' });
      } catch {}
      settle(abortSignal?.reason ?? new DOMException('Aborted', 'AbortError'));
    }
    if (abortSignal?.aborted) onAbort();
    else abortSignal?.addEventListener('abort', onAbort, { once: true });

    return {
      done,
      async submitToolResult(result) {
        assertOpen();
        channel.send({ type: 'tool-result', ...result });
      },
      async submitUserMessage() {
        throw unsupported('mid-turn user messages are not supported yet');
      },
    };
  };

  const startTurn = (
    options: HarnessV1PromptTurnOptions,
    operation: 'prompt' | 'compact',
    prompt: string,
  ) => {
    const control = wireTurn(options);
    channel.send({
      type: 'start',
      operation,
      prompt,
      ...(options.tools?.length ? { tools: [...options.tools] } : {}),
      ...(model ? { model } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(resumeJcodeSessionId
        ? { resumeSessionId: resumeJcodeSessionId }
        : {}),
    });
    return control;
  };

  const teardown = async (operation: 'stop' | 'destroy') => {
    channel.beginClose();
    try {
      if (!channel.isClosed()) channel.send({ type: operation });
    } catch {}
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        proc.wait(),
        new Promise<void>(resolve => {
          timer = setTimeout(resolve, 5000);
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      try {
        await proc.kill();
      } catch {}
      channel.close();
    }
  };

  return {
    sessionId,
    isResume: resumeJcodeSessionId != null,
    ...(model ? { modelId: model } : {}),
    async doPromptTurn(options) {
      assertOpen();
      if (options.responseFormat?.type === 'json') {
        throw unsupported('JSON response format is not supported yet');
      }
      let prompt = extractJcodePrompt(options.prompt);
      if (firstPrompt && options.instructions) {
        prompt = frameJcodeInstructions(options.instructions, prompt);
      }
      firstPrompt = false;
      return startTurn(options, 'prompt', prompt);
    },
    async doCompact(customInstructions) {
      assertOpen();
      if (customInstructions) {
        throw unsupported('custom compaction instructions are not supported');
      }
      const control = startTurn({ prompt: '', emit: () => {} }, 'compact', '');
      await control.done;
    },
    async doContinueTurn() {
      throw unsupported('turn continuation is not supported yet');
    },
    async doSuspendTurn() {
      throw unsupported('turn suspension is not supported yet');
    },
    async doDetach() {
      throw unsupported(
        'detaching a live sandbox bridge is not supported yet; use stop',
      );
    },
    async doStop() {
      assertOpen();
      let stopData: unknown;
      const stopReceived = new Promise<void>(resolve => {
        const unsubscribe = channel.on('bridge-stop', message => {
          stopData = message.data;
          unsubscribe();
          resolve();
        });
      });
      channel.send({ type: 'stop' });
      await Promise.race([
        stopReceived,
        new Promise<void>(resolve => setTimeout(resolve, 5000)),
      ]);
      closed = true;
      await teardown('stop');
      const data =
        typeof stopData === 'object' && stopData != null
          ? { ...stopData, jcodeHome }
          : { jcodeHome };
      return {
        type: 'resume-session',
        harnessId: 'jcode',
        specificationVersion: 'harness-v1',
        data,
      } satisfies HarnessV1ResumeSessionState;
    },
    async doDestroy() {
      if (closed) return;
      closed = true;
      await teardown('destroy');
    },
  };
}
