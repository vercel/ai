import type { TencentModelIds } from './tencent-model-catalog';
/**
 * Video model IDs.
 *
 * - TokenHub Kling models use the TokenHub `model` value, e.g. `kling-video-v3`.
 *   See https://www.tencentcloud.com/document/product/1300/83714
 * - VOD AIGC models use `vod/<ModelName>/<ModelVersion>`, e.g. `vod/Kling/3.0`.
 *   See https://www.tencentcloud.com/document/api/266/76684
 */
export type TencentVideoModelId = TencentModelIds['video'] | (string & {});

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

export { parseTencentVideoModelId } from './tencent-model-catalog';
