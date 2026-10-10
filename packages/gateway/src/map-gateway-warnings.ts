import type { ImageModelV2CallWarning } from '@ai-sdk/provider';

type GatewayResponseWarning =
  | ImageModelV2CallWarning
  | { type: 'deprecated'; setting: string; message: string };

/**
 * Maps warnings from gateway responses to `ImageModelV2CallWarning`.
 *
 * The gateway backend can emit `deprecated` warnings, which the v2
 * specification cannot represent — they are mapped to `other` warnings.
 */
export function mapGatewayWarnings(
  warnings: Array<GatewayResponseWarning> | undefined,
): Array<ImageModelV2CallWarning> {
  return (warnings ?? []).map(warning =>
    warning.type === 'deprecated'
      ? { type: 'other', message: warning.message }
      : warning,
  );
}
