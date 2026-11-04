import { HarnessBridgeCapabilityUnsupportedError } from '@ai-sdk/harness/bridge';
import * as acp from '@agentclientprotocol/sdk';
import type { ACPInitializeResult } from './protocol-configuration';

export type ACPActiveSession = {
  readonly sessionId: string;
  readonly newSessionResponse: acp.NewSessionResponse;
  prompt(prompt: Array<acp.ContentBlock>): Promise<acp.PromptResponse>;
  promptWithMeta?(options: {
    prompt: Array<acp.ContentBlock>;
    meta: Record<string, unknown>;
  }): Promise<acp.PromptResponse>;
  nextUpdate(): Promise<acp.ActiveSessionMessage>;
  dispose(): void;
};

export function assertACPResumeCapability({
  initialization,
  harnessId,
}: {
  initialization: ACPInitializeResult;
  harnessId: string;
}): void {
  const sessionCapabilities = initialization.agentCapabilities
    ?.sessionCapabilities as Readonly<Record<string, unknown>> | undefined;
  if (
    sessionCapabilities?.resume == null ||
    sessionCapabilities.resume === false
  ) {
    throw new HarnessBridgeCapabilityUnsupportedError({
      harnessId,
      message:
        'ACP process-loss rerun requires the agent to advertise sessionCapabilities.resume; a fresh unrelated ACP session will not be created.',
    });
  }
}

export function createACPRecoveredSession({
  agent,
  sessionId,
  restorationResponse,
  updates,
}: {
  agent: acp.ClientContext;
  sessionId: string;
  restorationResponse: acp.ResumeSessionResponse | acp.LoadSessionResponse;
  updates: ReturnType<typeof createACPRecoveredSessionUpdates>;
}): ACPActiveSession {
  let disposed = false;
  return {
    sessionId,
    newSessionResponse: {
      sessionId,
      ...restorationResponse,
    },
    prompt: async prompt => {
      if (disposed) {
        throw new Error('Recovered ACP session is disposed.');
      }
      updates.clearErrors();
      const response = agent.request<acp.PromptResponse, acp.PromptRequest>(
        acp.methods.agent.session.prompt,
        { sessionId, prompt },
      );
      void response.then(
        value => {
          updates.enqueue({
            kind: 'stop',
            response: value,
            stopReason: value.stopReason,
          });
        },
        error => updates.reject(error),
      );
      return response;
    },
    promptWithMeta: async ({ prompt, meta }) => {
      if (disposed) {
        throw new Error('Recovered ACP session is disposed.');
      }
      updates.clearErrors();
      const response = agent.request<acp.PromptResponse, acp.PromptRequest>(
        acp.methods.agent.session.prompt,
        { sessionId, prompt, _meta: meta },
      );
      void response.then(
        value => {
          updates.enqueue({
            kind: 'stop',
            response: value,
            stopReason: value.stopReason,
          });
        },
        error => updates.reject(error),
      );
      return response;
    },
    nextUpdate: () => updates.next(),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      updates.fail(new Error('Recovered ACP session disposed.'));
    },
  };
}

export function createACPRecoveredSessionUpdates(): {
  enqueue(value: acp.ActiveSessionMessage): void;
  reject(error: unknown): void;
  clearErrors(): void;
  fail(error: unknown): void;
  next(): Promise<acp.ActiveSessionMessage>;
} {
  type Entry =
    | { readonly type: 'value'; readonly value: acp.ActiveSessionMessage }
    | { readonly type: 'error'; readonly error: unknown };
  const values: Entry[] = [];
  const waiters: Array<{
    resolve(value: acp.ActiveSessionMessage): void;
    reject(error: unknown): void;
  }> = [];
  let failure: unknown;
  let failed = false;
  return {
    enqueue(value) {
      if (failed) return;
      const waiter = waiters.shift();
      if (waiter == null) values.push({ type: 'value', value });
      else waiter.resolve(value);
    },
    reject(error) {
      if (failed) return;
      const waiter = waiters.shift();
      if (waiter == null) values.push({ type: 'error', error });
      else waiter.reject(error);
    },
    clearErrors() {
      for (let index = values.length - 1; index >= 0; index--) {
        if (values[index]?.type === 'error') values.splice(index, 1);
      }
    },
    fail(error) {
      if (failed) return;
      failed = true;
      failure = error;
      for (const waiter of waiters.splice(0)) waiter.reject(error);
    },
    next() {
      const entry = values.shift();
      if (entry?.type === 'value') return Promise.resolve(entry.value);
      if (entry?.type === 'error') {
        return Promise.reject(
          entry.error instanceof Error
            ? entry.error
            : new Error('Recovered ACP session update failed.'),
        );
      }
      if (failed) {
        return Promise.reject(
          failure instanceof Error
            ? failure
            : new Error('Recovered ACP session update stream failed.'),
        );
      }
      return new Promise((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
  };
}
