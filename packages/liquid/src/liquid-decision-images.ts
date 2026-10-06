import {
  InvalidArgumentError,
  type Experimental_DecisionModelV4Input as DecisionModelV4Input,
} from '@ai-sdk/provider';
import { isRecord } from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

const liquidImagesSchema = z
  .array(
    z.union([
      z
        .string()
        .regex(
          /^data:image\/(?:gif|jpeg|png|webp);base64,(?=.+)(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
        ),
      z.object({
        content_type: z.enum([
          'image/gif',
          'image/jpeg',
          'image/png',
          'image/webp',
        ]),
        base64: z.string().min(1).base64(),
      }),
    ]),
  )
  .max(8);

export function extractLiquidImages(state: DecisionModelV4Input) {
  if (
    !isRecord(state) ||
    !Object.prototype.hasOwnProperty.call(state, 'images') ||
    state.images === undefined
  ) {
    return { state, images: undefined };
  }

  const parsed = liquidImagesSchema.safeParse(state.images);
  if (!parsed.success) {
    throw new InvalidArgumentError({
      argument: 'state.images',
      message:
        'state.images must contain at most 8 PNG, JPEG, WebP, or GIF images as base64 data URLs or { content_type, base64 } objects.',
    });
  }

  if (parsed.data.length === 0) {
    return { state, images: undefined };
  }

  // Liquid reads vision inputs from the top-level images array. Copy the
  // remaining state so the image bytes are not also sent as text or removed
  // from the caller's object.
  const { images: _images, ...textState } = state;
  return { state: textState, images: parsed.data };
}
