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
  // `nativeName` and `observeOnly` are harness-only extensions on `tool-call`:
  //  - `nativeName` lets adapters surface the runtime's name for a builtin
  //    when it differs from `toolName` (e.g. `toolName: 'bash'`,
  //    `nativeName: 'Bash'`).
  //  - `observeOnly: true` signals the host should not execute this call —
  //    the adapter has already produced or will produce the result itself
  //    (used by tool-interception flows).
  | (LanguageModelV4ToolCall & {
      nativeName?: string;
      observeOnly?: boolean;
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

  // Errors. Multiple may be emitted in a single turn.
  | { type: 'error'; error: unknown }

  // Adapter-specific passthrough. Consumers can opt in to receive these via
  // `HarnessAgent` settings; otherwise they are dropped.
  | { type: 'raw'; rawValue: unknown };
