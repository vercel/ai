import type { SessionUpdate, ToolCallUpdate } from '@agentclientprotocol/sdk';
import { canonicalFingerprint } from './canonical-json-fingerprint';
import {
  resolveHostToolCall,
  type HostToolCall,
} from './resolve-host-tool-call';

type ObservedCall = {
  toolCall: ToolCallUpdate;
  consumed: boolean;
  terminal: boolean;
};

const DEFAULT_AUTHORIZATION_WAIT_MS = 10_000;

export function createHostToolRelayAuthorization({
  serverName,
  toolNames,
  ttlMs = DEFAULT_AUTHORIZATION_WAIT_MS,
}: {
  serverName: string;
  toolNames: ReadonlyArray<string>;
  ttlMs?: number;
}): {
  observeUpdate(options: { update: SessionUpdate }): void;
  observeAllowedPermission(options: { toolCall: ToolCallUpdate }): void;
  waitForToolCallAuthorization(options: HostToolCall): Promise<boolean>;
  close(): void;
} {
  const observedCalls = new Map<string, ObservedCall>();
  const authorizations = new Map<string, string>();
  const pendingRequests: Array<{
    key: string;
    timeout: ReturnType<typeof setTimeout>;
    resolve: (authorized: boolean) => void;
  }> = [];
  let closed = false;

  const observe = ({ toolCall }: { toolCall: ToolCallUpdate }) => {
    if (closed) return;
    const previous = observedCalls.get(toolCall.toolCallId);
    if (previous?.consumed || previous?.terminal) return;
    const merged: ToolCallUpdate = {
      ...previous?.toolCall,
      ...toolCall,
      ...(toolCall.name == null && previous?.toolCall.name != null
        ? { name: previous.toolCall.name }
        : {}),
      ...(toolCall.rawInput === undefined &&
      previous?.toolCall.rawInput !== undefined
        ? { rawInput: previous.toolCall.rawInput }
        : {}),
      ...(toolCall.title == null && previous?.toolCall.title != null
        ? { title: previous.toolCall.title }
        : {}),
      ...(toolCall._meta == null && previous?.toolCall._meta != null
        ? { _meta: previous.toolCall._meta }
        : {}),
    };
    const observed: ObservedCall = {
      toolCall: merged,
      consumed: false,
      terminal: merged.status === 'completed' || merged.status === 'failed',
    };
    observedCalls.set(toolCall.toolCallId, observed);
    if (observed.terminal) {
      authorizations.delete(toolCall.toolCallId);
      return;
    }

    const call = resolveHostToolCall({
      toolCall: merged,
      serverName,
      toolNames,
    });
    if (call == null) {
      authorizations.delete(toolCall.toolCallId);
      return;
    }
    const key = callKey(call);
    authorizations.set(toolCall.toolCallId, key);
    const pendingIndex = pendingRequests.findIndex(
      request => request.key === key,
    );
    if (pendingIndex !== -1) {
      const [pending] = pendingRequests.splice(pendingIndex, 1);
      clearTimeout(pending.timeout);
      authorizations.delete(toolCall.toolCallId);
      observed.consumed = true;
      pending.resolve(true);
    }
  };

  return {
    observeUpdate: ({ update }) => {
      if (
        update.sessionUpdate === 'tool_call' ||
        update.sessionUpdate === 'tool_call_update'
      ) {
        observe({ toolCall: update });
      }
    },
    observeAllowedPermission: ({ toolCall }) => observe({ toolCall }),
    waitForToolCallAuthorization: ({ toolName, input }) => {
      if (closed) return Promise.resolve(false);
      const key = callKey({ toolName, input });
      for (const [toolCallId, authorizationKey] of authorizations) {
        if (authorizationKey !== key) continue;
        authorizations.delete(toolCallId);
        observedCalls.get(toolCallId)!.consumed = true;
        return Promise.resolve(true);
      }
      return new Promise(resolve => {
        const pending = {
          key,
          timeout: setTimeout(() => {
            const index = pendingRequests.indexOf(pending);
            if (index !== -1) pendingRequests.splice(index, 1);
            resolve(false);
          }, ttlMs),
          resolve,
        };
        pendingRequests.push(pending);
      });
    },
    close: () => {
      if (closed) return;
      closed = true;
      observedCalls.clear();
      authorizations.clear();
      for (const request of pendingRequests.splice(0)) {
        clearTimeout(request.timeout);
        request.resolve(false);
      }
    },
  };
}

function callKey({ toolName, input }: HostToolCall): string {
  return `${toolName}\0${canonicalFingerprint({ value: input })}`;
}
