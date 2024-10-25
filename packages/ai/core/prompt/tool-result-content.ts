import { z } from 'zod';

export type ToolResultContent = Array<
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      data: string; // base64 encoded png image, e.g. screenshot
      mimeType?: string; // e.g. 'image/png';
    }
>;

export const toolResultContentSchema: z.ZodType<ToolResultContent> = z.array(
  z.union([
    z.object({ type: z.literal('text'), text: z.string() }),
    z.object({
      type: z.literal('image'),
      data: z.string(),
      mimeType: z.string().optional(),
    }),
  ]),
);

export function isToolResultContent(
  value: unknown,
): value is ToolResultContent {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  return value.every(part => {
    if (typeof part !== 'object' || part === null) {
      return false;
    }

    if (part.type === 'text') {
      return typeof part.text === 'string';
    }

    if (part.type === 'image') {
      return (
        typeof part.data === 'string' &&
        (part.mimeType === undefined || typeof part.mimeType === 'string')
      );
    }

    return false;
  });
}
