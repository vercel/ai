import type {
  LanguageModelV4FinishReason,
  LanguageModelV4ToolApprovalRequest,
  LanguageModelV4ToolCall,
  LanguageModelV4ToolResult,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import type { HarnessV1CallWarning } from './harness-v1-call-warning';
import type { HarnessV1Metadata } from './harness-v1-metadata';

/**
 * One event emitted by a harness adapter during a prompt turn.
 *
 * Mirrors `LanguageModelV4StreamPart` on the variants it shares so a
 * `HarnessAgent` can pipe events through to AI SDK consumers with minimal
 * translation. Primitive types from the V4 spec (`LanguageModelV4ToolCall`,
 * `LanguageModelV4ToolResult`, `LanguageModelV4ToolApprovalRequest`,
 * `LanguageModelV4Usage`, `LanguageModelV4FinishReason`) are reused
 * verbatim — type-compat tests assert this stays the case.
 *
 * The metadata field is named `harnessMetadata` (not `providerMetadata`)
 * because a harness is a peer to a provider, not a kind of provider. The
 * agent rebinds it when forwarding to AI SDK consumers.
 */
export type HarnessV1StreamPart =
  | {
      type: 'stream-start';
      warnings?: ReadonlyArray<HarnessV1CallWarning>;
    }

  // Text blocks
  | { type: 'text-start'; id: string; harnessMetadata?: HarnessV1Metadata }
  | {
      type: 'text-delta';
      id: string;
      delta: string;
      harnessMetadata?: HarnessV1Metadata;
    }
  | { type: 'text-end'; id: string; harnessMetadata?: HarnessV1Metadata }

  // Reasoning blocks
  | { type: 'reasoning-start'; id: string; harnessMetadata?: HarnessV1Metadata }
  | {
      type: 'reasoning-delta';
      id: string;
      delta: string;
      harnessMetadata?: HarnessV1Metadata;
    }
  | { type: 'reasoning-end'; id: string; harnessMetadata?: HarnessV1Metadata }

  // Tool calls, approvals, results — reuse V4 primitives.
  //
  // `nativeName` is the only harness-only extension on `tool-call`. It lets
  // adapters surface the runtime's native name for a builtin when it differs
  // from the wire `toolName` (e.g. `toolName: 'bash'`, `nativeName: 'Bash'`).
  //
  // Whether the call was executed by the underlying runtime (Claude Code's
  // built-in `Bash`, Codex's `shell`) vs. needs host dispatch is signalled by
  // the standard `providerExecuted` field on `LanguageModelV4ToolCall` —
  // `true` for runtime-executed builtins, false/undefined for host tools.
  | (LanguageModelV4ToolCall & {
      nativeName?: string;
    })
  | LanguageModelV4ToolApprovalRequest
  | LanguageModelV4ToolResult

  // Step boundary inside a multi-step turn.
  | {
      type: 'finish-step';
      finishReason: LanguageModelV4FinishReason;
      usage: LanguageModelV4Usage;
      harnessMetadata?: HarnessV1Metadata;
    }

  // Turn end.
  | {
      type: 'finish';
      finishReason: LanguageModelV4FinishReason;
      totalUsage: LanguageModelV4Usage;
      harnessMetadata?: HarnessV1Metadata;
    }

  // Workspace file mutation that occurred through an opaque underlying
  // mechanism (one with no visible `tool-call` carrying the same data, e.g.
  // Codex's internal `apply_patch`). Emitted per changed path. Path-only by
  // design — when the mutation goes through a visible tool call, the
  // tool-call/tool-result pair already carries the information.
  | {
      type: 'file-change';
      event: 'create' | 'modify' | 'delete';
      path: string;
      harnessMetadata?: HarnessV1Metadata;
    }

  // Errors. Multiple may be emitted in a single turn.
  | { type: 'error'; error: unknown }

  // Adapter-specific passthrough. Consumers can opt in to receive these via
  // `HarnessAgent` settings; otherwise they are dropped.
  | { type: 'raw'; rawValue: unknown };
