import type {
  HarnessAgentContinueTurnState,
  HarnessAgentResumeSessionState,
  HarnessAgentSession,
} from '@ai-sdk/harness/agent';
import type { ModelMessage } from 'ai';

export type SteppedHarnessWorkflowStatus =
  | 'running'
  | 'awaiting-host-input'
  | 'finished'
  | 'failed';

export interface SteppedHarnessWorkflowInput {
  readonly sessionId: string;
  readonly messages: ModelMessage[];
}

export interface SteppedHarnessWorkflowState extends SteppedHarnessWorkflowInput {
  readonly status: SteppedHarnessWorkflowStatus;
  readonly resumeFrom?: HarnessAgentResumeSessionState;
  readonly continueFrom?: HarnessAgentContinueTurnState;
  readonly finalResult?: {
    readonly sessionId: string;
    readonly finishReason: string;
  };
  readonly error?: string;
}

interface SteppedHarnessWorkflowChunk {
  readonly type: string;
  readonly [key: string]: unknown;
}

interface SteppedHarnessWorkflowResult {
  toUIMessageStream(): ReadableStream<SteppedHarnessWorkflowChunk>;
  readonly finishReason: PromiseLike<unknown>;
}

export interface SteppedHarnessWorkflowAgent {
  createSession(options?: {
    sessionId?: string;
    resumeFrom?: HarnessAgentResumeSessionState;
    continueFrom?: HarnessAgentContinueTurnState;
  }): Promise<HarnessAgentSession>;
  stream(options: {
    session: HarnessAgentSession;
    messages: ModelMessage[];
  }): Promise<SteppedHarnessWorkflowResult>;
  continueStream(options: {
    session: HarnessAgentSession;
  }): Promise<SteppedHarnessWorkflowResult>;
}

export async function runSteppedHarnessAgent(options: {
  agent: SteppedHarnessWorkflowAgent;
  state: SteppedHarnessWorkflowState;
}): Promise<SteppedHarnessWorkflowState> {
  const { agent, state } = options;
  const session =
    state.continueFrom != null
      ? await agent.createSession({
          sessionId: state.sessionId,
          continueFrom: state.continueFrom,
        })
      : state.resumeFrom != null
        ? await agent.createSession({
            sessionId: state.sessionId,
            resumeFrom: state.resumeFrom,
          })
        : await agent.createSession({ sessionId: state.sessionId });

  let result: SteppedHarnessWorkflowResult;
  try {
    result =
      state.continueFrom != null
        ? await agent.continueStream({ session })
        : await agent.stream({ session, messages: state.messages });
  } catch (error) {
    await session.destroy().catch(() => {});
    return failedState({ state, error });
  }

  const writable = await resolveWorkflowWritable();
  const writer = writable.getWriter();
  let writerClosed = false;
  try {
    const reader = result.toUIMessageStream().getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value == null || value.type === 'finish') continue;
        if (value.type === 'start' && state.continueFrom != null) continue;
        await writer.write(value);
      }
    } finally {
      reader.releaseLock();
    }

    const finishReason = toFinishReason(await result.finishReason);
    if (session.hasUnfinishedTurn()) {
      const continueFrom = await session.suspendTurn();
      if (hasPendingHostInput(continueFrom)) {
        await writer.write({ type: 'finish', finishReason: 'tool-calls' });
        await writer.close();
        writerClosed = true;
        return {
          sessionId: state.sessionId,
          messages: state.messages,
          status: 'awaiting-host-input',
          resumeFrom: toResumeState({ continueFrom }),
          finalResult: {
            sessionId: state.sessionId,
            finishReason: 'tool-calls',
          },
        };
      }
      return {
        sessionId: state.sessionId,
        messages: state.messages,
        status: 'running',
        continueFrom,
      };
    }

    const resumeFrom = await session.detach();
    await writer.write({ type: 'finish', finishReason });
    await writer.close();
    writerClosed = true;
    return {
      sessionId: state.sessionId,
      messages: state.messages,
      status: 'finished',
      resumeFrom,
      finalResult: { sessionId: state.sessionId, finishReason },
    };
  } catch (error) {
    await session.destroy().catch(() => {});
    if (!writerClosed) {
      await writer.close().catch(() => {});
      writerClosed = true;
    }
    return failedState({ state, error });
  } finally {
    if (!writerClosed) writer.releaseLock();
  }
}

function hasPendingHostInput(state: HarnessAgentContinueTurnState): boolean {
  return (
    (state.pendingToolApprovals?.length ?? 0) > 0 ||
    (state.pendingToolResults?.length ?? 0) > 0
  );
}

function toResumeState(options: {
  continueFrom: HarnessAgentContinueTurnState;
}): HarnessAgentResumeSessionState {
  const { continueFrom } = options;
  return {
    type: 'resume-session',
    harnessId: continueFrom.harnessId,
    specificationVersion: continueFrom.specificationVersion,
    data: continueFrom.data,
    continueFrom,
  };
}

function failedState(options: {
  state: SteppedHarnessWorkflowState;
  error: unknown;
}): SteppedHarnessWorkflowState {
  return {
    sessionId: options.state.sessionId,
    messages: options.state.messages,
    status: 'failed',
    ...(options.state.resumeFrom != null
      ? { resumeFrom: options.state.resumeFrom }
      : {}),
    ...(options.state.continueFrom != null
      ? { continueFrom: options.state.continueFrom }
      : {}),
    error:
      options.error instanceof Error
        ? options.error.message
        : String(options.error),
  };
}

function toFinishReason(value: unknown): string {
  return typeof value === 'string' ? value : 'stop';
}

async function resolveWorkflowWritable(): Promise<
  WritableStream<SteppedHarnessWorkflowChunk>
> {
  const { getWritable } = await import('workflow');
  return getWritable<SteppedHarnessWorkflowChunk>();
}
