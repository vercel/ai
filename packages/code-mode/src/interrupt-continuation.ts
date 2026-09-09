import {
  hasValidCodeModeContinuationCapability,
  verifyCodeModeContinuation,
} from './continuation-capability.js';
import { CodeModeProtocolError } from './errors.js';
import { runCodeMode } from './run-code-mode.js';
import type {
  CodeModeContinuationSecurityOptions,
  CodeModeInterrupt,
  CodeModeInterruptPayload,
  CodeModeInterruptResolution,
  CodeModeOptions,
  CodeModeToolExecutionOptions,
  CodeModeToolSet,
  CodeModeUnwrappedResult,
} from './types.js';

export function isCodeModeInterrupt(
  value: unknown,
  continuationSecurity: CodeModeContinuationSecurityOptions = {},
): value is CodeModeInterrupt {
  if (
    isRecord(value) &&
    value.type === 'code-mode-interrupt' &&
    typeof value.interruptId === 'string' &&
    typeof value.toolCallId === 'string' &&
    typeof value.toolName === 'string' &&
    typeof value.outerToolCallId === 'string' &&
    isRecord(value.payload) &&
    typeof value.payload.kind === 'string' &&
    isRecord(value.continuation) &&
    hasValidCodeModeContinuationCapability(
      value.continuation,
      continuationSecurity,
    )
  ) {
    try {
      assertInterruptMatchesLedger(value as unknown as CodeModeInterrupt);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function continueCodeModeInterrupt<
  TPayload extends CodeModeInterruptPayload = CodeModeInterruptPayload,
  TResolution = unknown,
>({
  interrupt,
  resolution,
  tools,
  options = {},
  toolExecutionOptions,
}: {
  interrupt: CodeModeInterrupt<TPayload>;
  resolution: TResolution;
  tools: CodeModeToolSet;
  options?: CodeModeOptions;
  toolExecutionOptions?: Partial<CodeModeToolExecutionOptions>;
}): Promise<unknown> {
  verifyCodeModeContinuation(
    interrupt.continuation,
    options.continuationSecurity,
  );
  assertInterruptMatchesLedger(interrupt);

  const interruptResolution: CodeModeInterruptResolution<TResolution> = {
    interruptId: interrupt.interruptId,
    resolution,
  };
  return await runCodeMode({
    js: interrupt.continuation.js,
    tools,
    options,
    continuation: interrupt.continuation,
    interruptResolution,
    ...(toolExecutionOptions !== undefined ? { toolExecutionOptions } : {}),
  });
}

export function getCodeModeInterrupt(
  result: unknown,
  continuationSecurity: CodeModeContinuationSecurityOptions = {},
): CodeModeInterrupt | undefined {
  const direct = readInterruptValue(result, continuationSecurity);
  if (direct !== undefined) {
    return direct;
  }
  if (!isRecord(result)) {
    return undefined;
  }

  for (const key of ['toolResults', 'content'] as const) {
    const parts = result[key];
    if (!Array.isArray(parts)) {
      continue;
    }
    for (const part of parts) {
      if (!isRecord(part)) {
        continue;
      }
      const interrupt = readInterruptValue(part.output, continuationSecurity);
      if (interrupt !== undefined) {
        return interrupt;
      }
    }
  }
  return undefined;
}

export function unwrapCodeModeResult(
  result: unknown,
  continuationSecurity: CodeModeContinuationSecurityOptions = {},
): CodeModeUnwrappedResult {
  const interrupt = getCodeModeInterrupt(result, continuationSecurity);
  return interrupt === undefined
    ? { status: 'completed', output: result }
    : { status: 'interrupted', interrupt };
}

function readInterruptValue(
  value: unknown,
  continuationSecurity: CodeModeContinuationSecurityOptions,
): CodeModeInterrupt | undefined {
  if (isCodeModeInterrupt(value, continuationSecurity)) {
    return value;
  }
  if (
    isRecord(value) &&
    (value.type === 'json' || value.type === 'text') &&
    'value' in value
  ) {
    return readInterruptValue(value.value, continuationSecurity);
  }
  return undefined;
}

function assertInterruptMatchesLedger(interrupt: CodeModeInterrupt): void {
  if (interrupt.continuation.outerToolCallId !== interrupt.outerToolCallId) {
    throw new CodeModeProtocolError(
      'Code-mode interrupt outer tool call id does not match its continuation.',
    );
  }
  const pending =
    interrupt.continuation.pendingInterruptions[
      interrupt.continuation.resolutions.length
    ];
  if (
    pending === undefined ||
    pending.interruptId !== interrupt.interruptId ||
    pending.toolCallId !== interrupt.toolCallId ||
    pending.toolName !== interrupt.toolName ||
    !jsonEqual(pending.input, interrupt.input) ||
    !jsonEqual(pending.payload, interrupt.payload)
  ) {
    throw new CodeModeProtocolError(
      'Code-mode interrupt metadata does not match the signed continuation ledger.',
      { interruptId: interrupt.interruptId },
    );
  }
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
