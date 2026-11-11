/**
 * Video model IDs.
 *
 * - TokenHub Kling models use the TokenHub `model` value, e.g. `kling-video-v3`.
 *   See https://www.tencentcloud.com/document/product/1300/83714
 * - VOD AIGC models use `vod/<ModelName>/<ModelVersion>`, e.g. `vod/Kling/3.0`.
 *   See https://www.tencentcloud.com/document/api/266/76684
 */
export type TencentVideoModelId =
  // TokenHub Kling
  | 'kling-video-v4'
  | 'kling-video-v3'
  | 'kling-video-v3-turbo'
  | 'kling-video-v3-omni'
  | 'kling-video-motion-control-v3.0'
  | 'kling-video-motion-control-v2.6'
  // VOD AIGC
  | 'vod/VS/2.5'
  | 'vod/VS/2.0'
  | 'vod/VS/2.0-fast'
  | 'vod/VS/2.0-mini'
  | 'vod/Kling/3.0'
  | 'vod/Kling/3.0-Omni'
  | 'vod/Kling/3.0-turbo'
  | 'vod/Kling/2.6'
  | 'vod/Hailuo/2.3'
  | 'vod/Vidu/q3-pro'
  | (string & {});

export type TencentKlingVideoKind = 'standard' | 'omni' | 'motion-control';

export type ParsedTencentVideoModelId =
  | {
      backend: 'tokenhub';
      kind: TencentKlingVideoKind;
    }
  | {
      backend: 'vod';
      modelName: string;
      modelVersion: string;
    };

const VOD_MODEL_ID_PREFIX = 'vod/';

export function parseTencentVideoModelId(
  modelId: string,
): ParsedTencentVideoModelId | undefined {
  if (modelId.startsWith(VOD_MODEL_ID_PREFIX)) {
    const rest = modelId.slice(VOD_MODEL_ID_PREFIX.length);
    const separator = rest.indexOf('/');
    if (separator <= 0 || separator === rest.length - 1) {
      return undefined;
    }
    return {
      backend: 'vod',
      modelName: rest.slice(0, separator),
      modelVersion: rest.slice(separator + 1),
    };
  }

  if (modelId.startsWith('kling-video-motion-control-')) {
    return { backend: 'tokenhub', kind: 'motion-control' };
  }

  if (modelId.startsWith('kling-video-')) {
    return {
      backend: 'tokenhub',
      kind: modelId.endsWith('-omni') ? 'omni' : 'standard',
    };
  }

  return undefined;
}
