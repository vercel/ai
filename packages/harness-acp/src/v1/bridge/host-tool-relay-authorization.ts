import type { SessionUpdate, ToolCallUpdate } from '@agentclientprotocol/sdk';
import type { ACPToolCall } from '../../acp-tool-call';
import { canonicalFingerprint } from './canonical-json-fingerprint';
import { mergeObservedToolCall } from './merge-observed-tool-call';
import {
  resolveHostToolCall,
  type HostToolCall,
} from './resolve-host-tool-call';

type ObservedCall = {
  toolCall?: ACPToolCall;
  permissionCall?: HostToolCall;
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
  authorizePermission(options: {
    toolCallId: string;
    call: HostToolCall;
  }): void;
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

  const authorizeCall = ({
    toolCallId,
    call,
    observed,
  }: {
    toolCallId: string;
    call: HostToolCall;
    observed: ObservedCall;
  }) => {
    const key = callKey(call);
    authorizations.set(toolCallId, key);
    const pendingIndex = pendingRequests.findIndex(
      request => request.key === key,
    );
    if (pendingIndex !== -1) {
      const [pending] = pendingRequests.splice(pendingIndex, 1);
      clearTimeout(pending.timeout);
      authorizations.delete(toolCallId);
      observed.consumed = true;
      pending.resolve(true);
    }
  };

  const observe = ({ toolCall }: { toolCall: ToolCallUpdate }) => {
    if (closed) return;
    const previous = observedCalls.get(toolCall.toolCallId);
    if (previous?.consumed || previous?.terminal) return;
    const merged = mergeObservedToolCall({
      previous: previous?.toolCall,
      update: toolCall,
    });
    const permissionCall =
      toolCall.name == null &&
      toolCall.rawInput === undefined &&
      toolCall._meta === undefined
        ? previous?.permissionCall
        : undefined;
    const observed: ObservedCall = {
      toolCall: merged,
      permissionCall,
      consumed: false,
      terminal: merged.status === 'completed' || merged.status === 'failed',
    };
    observedCalls.set(toolCall.toolCallId, observed);
    if (observed.terminal) {
      authorizations.delete(toolCall.toolCallId);
      return;
    }

    const call =
      permissionCall ??
      resolveHostToolCall({
        toolCall: merged,
        serverName,
        toolNames,
      });
    if (call == null) {
      authorizations.delete(toolCall.toolCallId);
      return;
    }
    authorizeCall({ toolCallId: toolCall.toolCallId, call, observed });
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
    authorizePermission: ({ toolCallId, call }) => {
      if (closed) return;
      const previous = observedCalls.get(toolCallId);
      if (previous?.consumed || previous?.terminal) return;
      const observed: ObservedCall = {
        toolCall: previous?.toolCall,
        permissionCall: call,
        consumed: false,
        terminal: false,
      };
      observedCalls.set(toolCallId, observed);
      authorizeCall({ toolCallId, call, observed });
    },
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
