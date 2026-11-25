import type { ImageModelV4CallOptions } from '../../image-model/v4';
import type { BatchV4RequestBase } from './batch-v4-request';

/**
 * One image generation request in a batch.
 */
export type ImageBatchV4Request<ModelId extends string = string> =
  BatchV4RequestBase<ModelId> & {
    readonly type: 'image';
    readonly options: Pick<
      ImageModelV4CallOptions,
      | 'prompt'
      | 'n'
      | 'size'
      | 'aspectRatio'
      | 'seed'
      | 'files'
      | 'mask'
      | 'providerOptions'
    >;
  };
