import type {
  ActiveSessionMessage,
  ToolCallUpdate,
} from '@agentclientprotocol/sdk';
import type {
  HarnessV1BridgeToolWire,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import type { ACPToolCall } from '../../acp-tool-call';
import type { ACPBuiltinToolMapping } from '../acp-v1-bridge-protocol';
import { createACPStreamTranslator } from './stream-translator';
import { createHostToolCorrelation } from './host-tool-correlation';

export function createEmitStreamEvent({
  emit,
  emitToolCallCandidate,
  builtinTools,
  hostToolServerName,
  hostTools,
}: {
  emit: (event: HarnessV1StreamPart) => void;
  emitToolCallCandidate: (options: { toolCall: ACPToolCall }) => void;
  builtinTools: ReadonlyArray<ACPBuiltinToolMapping>;
  hostToolServerName: string;
  hostTools: ReadonlyArray<HarnessV1BridgeToolWire>;
}): {
  message: (options: {
    message: ActiveSessionMessage;
    rawUpdate?: unknown;
  }) => boolean;
  raw: (options: { rawValue: unknown }) => void;
  close: () => void;
  permissionToolCall: (options: { toolCall: ToolCallUpdate }) => void;
  claimHostToolPermission: (options: { toolCall: ToolCallUpdate }) => boolean;
  hostToolCall: (options: {
    toolCallId: string;
    toolName: string;
    input: Readonly<Record<string, unknown>>;
  }) => void;
  hostToolResult: (options: {
    toolCallId: string;
    toolName: string;
    output: unknown;
    isError?: boolean;
  }) => void;
  registerHostToolCorrelationInvocation: (options: {
    token: string;
    serverName: string;
    toolName: string;
    input: Readonly<Record<string, unknown>>;
    order: number;
  }) => void;
  removeHostToolCorrelationInvocation: (options: { token: string }) => void;
  suppressToolCall: (options: { toolCallId: string }) => void;
  getToolCall: (options: { toolCallId: string }) => ACPToolCall | undefined;
} {
  const translator = createACPStreamTranslator({
    emit,
    emitToolCallCandidate,
    builtinTools,
  });
  const correlation = createHostToolCorrelation({
    emitSemanticUpdate: ({ message, rawUpdate }) => {
      translator.update({
        update: message.update,
        rawUpdate,
        preserveRaw: false,
      });
    },
    emitRawUpdate: ({ rawUpdate }) => {
      translator.raw({ rawValue: rawUpdate });
    },
    hostToolServerName,
    hostTools,
  });

  return {
    message: ({ message, rawUpdate }) => {
      if (message.kind === 'stop') {
        correlation.close();
        translator.finish(message.response);
        return true;
      }
      correlation.update({ message, rawUpdate });
      return false;
    },
    raw: translator.raw,
    close: () => {
      correlation.close();
      translator.close();
    },
    permissionToolCall: ({ toolCall }) => {
      translator.permissionToolCall({
        toolCall: {
          sessionUpdate: 'tool_call_update',
          ...toolCall,
        },
      });
    },
    claimHostToolPermission: correlation.claimHostToolPermission,
    hostToolCall: translator.hostToolCall,
    hostToolResult: translator.hostToolResult,
    registerHostToolCorrelationInvocation: correlation.registerInvocation,
    removeHostToolCorrelationInvocation: correlation.removeInvocation,
    suppressToolCall: correlation.suppressToolCall,
    getToolCall: ({ toolCallId }) =>
      correlation.getToolCall({ toolCallId }) ??
      translator.getToolCall({ toolCallId }),
  };
}
