import {
  JcodeClient,
  type ExternalToolCall,
  type ExternalToolDefinition,
} from '@1jehuang/jcode-sdk';
import {
  runBridge,
  type BridgeEvent,
  type BridgeTurn,
} from '@ai-sdk/harness/bridge';
import { argv } from 'node:process';
import type { JcodeBridgeStartMessage } from '../jcode-bridge-protocol';
import {
  createJcodeTranslatorState,
  translateJcodeEvent,
  translateJcodeExternalToolCall,
  translateJcodeExternalToolResult,
} from '../jcode-translate';

const args = parseArgs(argv.slice(2));
const workdir = required(args.workdir, '--workdir');
const bridgeStateDir = required(args.bridgeStateDir, '--bridge-state-dir');
const jcodeHome = required(args.jcodeHome, '--jcode-home');

let client: JcodeClient | undefined;
let sessionId: string | undefined;

await runBridge<JcodeBridgeStartMessage>({
  bridgeType: 'jcode',
  bridgeStateDir,
  onStart: runTurn,
  onStop: () => ({ jcodeSessionId: sessionId }),
  onDestroy: async () => {
    await client?.close();
    client = undefined;
  },
});

async function runTurn(
  start: JcodeBridgeStartMessage,
  turn: BridgeTurn,
): Promise<void> {
  try {
    const runtime = await ensureRuntime(start);
    if (start.operation === 'compact') {
      const summary = await runtime.compact(sessionId!);
      turn.emit({
        type: 'compaction',
        trigger: 'manual',
        summary,
      } as BridgeEvent);
      turn.emit(finishEvent());
      return;
    }

    const stream = runtime.events(sessionId!);
    const state = createJcodeTranslatorState();
    const externalToolNames = new Set(
      (start.tools ?? []).map(tool => tool.name),
    );
    const externalCallIds = new Set<string>();
    const externalResults = new Map<
      string,
      { readonly output: unknown; readonly isError: boolean }
    >();
    const abort = () => {
      void runtime.cancel(sessionId!).catch(() => {});
    };
    turn.abortSignal.addEventListener('abort', abort, { once: true });
    turn.emit({
      type: 'stream-start',
      ...(start.model ? { modelId: start.model } : {}),
    } as BridgeEvent);
    try {
      await runtime.setExternalTools(
        sessionId!,
        (start.tools ?? []).map(toExternalToolDefinition),
      );
      await runtime.sendMessage(sessionId!, start.prompt);
      for await (const event of stream) {
        if (event.ev === 'tool_start' && externalToolNames.has(event.name)) {
          externalCallIds.add(event.call_id);
          for (const part of translateJcodeEvent(event, state)) {
            turn.emit(part as BridgeEvent);
          }
          continue;
        }
        if (
          event.ev === 'tool_input_delta' &&
          externalCallIds.has(event.call_id)
        ) {
          translateJcodeEvent(event, state);
          continue;
        }
        if (event.ev === 'tool_exec' && externalCallIds.has(event.call_id)) {
          const tool = state.tools.get(event.call_id);
          if (!tool)
            throw new Error(`missing external tool state: ${event.call_id}`);
          tool.emitted = true;
          state.stepHadToolCall = true;
          turn.emit({
            type: 'tool-call',
            toolCallId: event.call_id,
            toolName: event.name,
            input: tool.input || '{}',
            providerExecuted: false,
            dynamic: false,
          } as BridgeEvent);
          continue;
        }
        if (event.ev === 'tool_done' && externalCallIds.delete(event.call_id)) {
          const submitted = externalResults.get(event.call_id);
          externalResults.delete(event.call_id);
          state.tools.delete(event.call_id);
          turn.emit(
            translateJcodeExternalToolResult({
              toolCallId: event.call_id,
              toolName: event.name,
              output: submitted?.output ?? event.error ?? event.output,
              isError: submitted?.isError ?? event.error != null,
            }) as BridgeEvent,
          );
          continue;
        }
        if (event.ev === 'error') {
          throw new Error(`${event.code}: ${event.message}`);
        }
        if (event.ev === 'external_tool_call') {
          if (!externalCallIds.has(event.call_id)) {
            state.stepHadToolCall = true;
            turn.emit(translateJcodeExternalToolCall(event) as BridgeEvent);
          }
          externalResults.set(
            event.call_id,
            await forwardExternalToolCall(runtime, event, turn),
          );
          continue;
        }
        for (const part of translateJcodeEvent(event, state)) {
          turn.emit(part as BridgeEvent);
        }
        if (event.ev === 'turn_done') return;
      }
      throw new Error('Jcode event stream closed before turn_done');
    } finally {
      turn.abortSignal.removeEventListener('abort', abort);
      await stream.return?.();
    }
  } catch (error) {
    turn.emitError({ error, message: 'Jcode turn failed' });
  }
}

function toExternalToolDefinition(
  tool: NonNullable<JcodeBridgeStartMessage['tools']>[number],
): ExternalToolDefinition {
  return {
    name: tool.name,
    description: tool.description ?? '',
    input_schema:
      tool.inputSchema != null &&
      typeof tool.inputSchema === 'object' &&
      !Array.isArray(tool.inputSchema)
        ? (tool.inputSchema as Record<string, unknown>)
        : {},
  };
}

async function forwardExternalToolCall(
  runtime: JcodeClient,
  call: ExternalToolCall,
  turn: BridgeTurn,
): Promise<{ readonly output: unknown; readonly isError: boolean }> {
  const result = await turn.requestToolResult(call.call_id);
  await runtime.submitExternalToolResult(call.root_session_id, {
    call_id: call.call_id,
    output: result.output,
    is_error: result.isError ?? false,
  });
  return { output: result.output, isError: result.isError ?? false };
}

async function ensureRuntime(
  start: JcodeBridgeStartMessage,
): Promise<JcodeClient> {
  client ??= await JcodeClient.launch({
    jcodeHome,
    workingDir: workdir,
    inheritLogins: false,
    clientName: 'ai-sdk/harness-jcode-bridge',
  });
  if (!sessionId) {
    const session = start.resumeSessionId
      ? await client.attachSession(start.resumeSessionId)
      : await client.createSession(workdir);
    sessionId = session.session_id;
    if (start.model) await client.setModel(sessionId, start.model);
    if (start.reasoningEffort) {
      await client.setReasoningEffort(sessionId, start.reasoningEffort);
    }
  }
  return client;
}

function finishEvent(): BridgeEvent {
  return {
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'compact' },
    totalUsage: {
      inputTokens: {
        total: 0,
        noCache: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    },
  } as BridgeEvent;
}

function parseArgs(values: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]?.replace(/^--/, '');
    const value = values[index + 1];
    if (key && value) parsed[key] = value;
  }
  return parsed;
}

function required(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`Missing ${flag} argument.`);
  return value;
}
