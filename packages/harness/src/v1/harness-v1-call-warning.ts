/**
 * Warning emitted by a harness adapter during a call.
 *
 * Surfaces non-fatal issues such as unsupported options or quirks of the
 * underlying agent runtime. These compatibility variants are also accepted by
 * the AI SDK's `CallWarning` result type.
 */
export type HarnessV1CallWarning =
  | {
      type: 'unsupported-setting';
      setting: string;
      details?: string;
    }
  | {
      type: 'unsupported-tool';
      tool: string;
      details?: string;
    }
  | {
      type: 'other';
      message: string;
    };

declare module 'ai' {
  interface CallWarningRegistry {
    harnessV1: HarnessV1CallWarning;
  }
}
