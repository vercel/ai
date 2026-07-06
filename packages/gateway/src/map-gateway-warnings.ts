import type { SharedV3Warning } from '@ai-sdk/provider';

type GatewayResponseWarning =
  | SharedV3Warning
  | { type: 'deprecated'; setting: string; message: string };

/**
 * Maps warnings from gateway responses to `SharedV3Warning`.
 *
 * The gateway backend can emit `deprecated` warnings, which the v3
 * specification cannot represent — they are mapped to `other` warnings.
 */
export function mapGatewayWarnings(
  warnings: Array<GatewayResponseWarning> | undefined,
): Array<SharedV3Warning> {
  return (warnings ?? []).map(warning =>
    warning.type === 'deprecated'
      ? { type: 'other', message: warning.message }
      : warning,
  );
}
