import type { ModelMessage } from 'ai';
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

/**
 * Returns true when a value is a generic code-mode host interruption.
 */
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

/**
 * Continues a code-mode invocation that previously returned a generic
 * interruption.
 */
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

/**
 * Finds a code-mode interruption in a result-like object.
 */
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

  const toolResults = result.toolResults;
  if (Array.isArray(toolResults)) {
    for (const toolResult of toolResults) {
      if (!isRecord(toolResult)) {
        continue;
      }
      const interrupt = readInterruptValue(
        toolResult.output,
        continuationSecurity,
      );
      if (interrupt !== undefined) {
        return interrupt;
      }
    }
  }

  const content = result.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!isRecord(part) || part.type !== 'tool-result') {
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

/**
 * Normalizes a direct or AI SDK result-like value into completed/interrupted
 * status.
 */
export function unwrapCodeModeResult(
  result: unknown,
  continuationSecurity: CodeModeContinuationSecurityOptions = {},
): CodeModeUnwrappedResult {
  const interrupt = getCodeModeInterrupt(result, continuationSecurity);
  if (interrupt !== undefined) {
    return { status: 'interrupted', interrupt };
  }
  return { status: 'completed', output: result };
}

/**
 * Replaces a stored outer `code_mode` interruption result in model history with
 * the final continuation output.
 */
export function replaceCodeModeInterruptResult(
  messages: ModelMessage[],
  interrupt: CodeModeInterrupt,
  finalOutput: unknown,
  continuationSecurity: CodeModeContinuationSecurityOptions = {},
): ModelMessage[] {
  let replacements = 0;
  let sawOuterToolCallId = false;
  const replacementOutput = toModelToolOutput(finalOutput);

  const nextMessages = messages.map((message): ModelMessage => {
    const looseMessage = message as { content?: unknown };
    if (!Array.isArray(looseMessage.content)) {
      return message;
    }

    let changed = false;
    const content = looseMessage.content.map((part: unknown) => {
      if (
        !isRecord(part) ||
        part.type !== 'tool-result' ||
        part.toolCallId !== interrupt.outerToolCallId
      ) {
        return part;
      }

      sawOuterToolCallId = true;
      if (
        !toolResultOutputContainsInterrupt(
          part.output,
          interrupt.interruptId,
          continuationSecurity,
        )
      ) {
        throw new CodeModeProtocolError(
          `Outer code_mode tool result ${interrupt.outerToolCallId} does not contain pending interrupt ${interrupt.interruptId}.`,
          {
            outerToolCallId: interrupt.outerToolCallId,
            interruptId: interrupt.interruptId,
          },
        );
      }

      replacements++;
      changed = true;
      return {
        ...part,
        output: replacementOutput,
      };
    });

    return changed
      ? ({ ...(message as Record<string, unknown>), content } as ModelMessage)
      : message;
  });

  if (replacements === 0) {
    throw new CodeModeProtocolError(
      sawOuterToolCallId
        ? `Outer code_mode tool result ${interrupt.outerToolCallId} was not replaced.`
        : `Missing outer code_mode tool result ${interrupt.outerToolCallId}.`,
      {
        outerToolCallId: interrupt.outerToolCallId,
        interruptId: interrupt.interruptId,
      },
    );
  }
  if (replacements > 1) {
    throw new CodeModeProtocolError(
      `Found multiple outer code_mode tool results for pending interrupt ${interrupt.interruptId}.`,
      {
        outerToolCallId: interrupt.outerToolCallId,
        interruptId: interrupt.interruptId,
        replacements,
      },
    );
  }

  return nextMessages;
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

function toolResultOutputContainsInterrupt(
  output: unknown,
  interruptId: string,
  continuationSecurity: CodeModeContinuationSecurityOptions,
): boolean {
  const interrupt = readInterruptValue(output, continuationSecurity);
  return (
    isCodeModeInterrupt(interrupt, continuationSecurity) &&
    interrupt.interruptId === interruptId
  );
}

function toModelToolOutput(value: unknown): unknown {
  if (typeof value === 'string') {
    return { type: 'text', value };
  }
  return { type: 'json', value: value === undefined ? null : value };
}

/**
 * Verifies the interruption's convenience metadata is consistent with its
 * signed continuation. The continuation ledger is the authenticated source of
 * truth, so this rejects an interruption whose unsigned metadata was swapped to
 * misrepresent the paused nested call (e.g. a different tool name or input).
 */
function assertInterruptMatchesLedger(interrupt: CodeModeInterrupt): void {
  if (interrupt.continuation.outerToolCallId !== interrupt.outerToolCallId) {
    throw new CodeModeProtocolError(
      'Code-mode interrupt outer tool call id does not match its continuation.',
      {
        interruptOuterToolCallId: interrupt.outerToolCallId,
        continuationOuterToolCallId: interrupt.continuation.outerToolCallId,
      },
    );
  }

  const matches = interrupt.continuation.ledger.filter(
    entry =>
      entry.kind === 'tool' &&
      entry.status === 'interrupted' &&
      entry.interruptId === interrupt.interruptId &&
      entry.toolCallId === interrupt.toolCallId &&
      entry.name === interrupt.toolName &&
      jsonEqual(fromJsonPayload(entry.inputJson), interrupt.input) &&
      jsonEqual(entry.interruptPayload, interrupt.payload),
  );
  if (matches.length !== 1) {
    throw new CodeModeProtocolError(
      'Code-mode interrupt metadata does not match the signed continuation ledger.',
      {
        interruptId: interrupt.interruptId,
        toolCallId: interrupt.toolCallId,
        toolName: interrupt.toolName,
        matches: matches.length,
      },
    );
  }
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function fromJsonPayload(valueJson: string): unknown {
  if (valueJson === '') {
    return undefined;
  }
  try {
    return JSON.parse(valueJson);
  } catch (error) {
    throw new CodeModeProtocolError(
      'Pending code-mode continuation ledger input is not valid JSON.',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
