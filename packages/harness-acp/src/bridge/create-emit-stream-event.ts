import type {
  ActiveSessionMessage,
  ToolCallUpdate,
} from '@agentclientprotocol/sdk';
import type {
  HarnessV1BridgeToolWire,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { createACPStreamTranslator, type ACPBuiltinTool } from './v1';
import { createHostToolCorrelation } from './host-tool-correlation';

export function createEmitStreamEvent({
  emit,
  builtinTools,
  hostToolServerName,
  hostTools,
}: {
  emit: (event: HarnessV1StreamPart) => void;
  builtinTools: ReadonlyArray<ACPBuiltinTool>;
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
} {
  const translator = createACPStreamTranslator({ emit, builtinTools });
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
      translator.update({
        update: {
          sessionUpdate: 'tool_call_update',
          ...toolCall,
        },
        rawUpdate: toolCall,
        preserveRaw: false,
      });
    },
    claimHostToolPermission: correlation.claimHostToolPermission,
    hostToolCall: translator.hostToolCall,
    hostToolResult: translator.hostToolResult,
    registerHostToolCorrelationInvocation: correlation.registerInvocation,
    removeHostToolCorrelationInvocation: correlation.removeInvocation,
  };
}
