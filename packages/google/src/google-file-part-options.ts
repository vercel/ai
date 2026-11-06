import { z } from 'zod/v4';

export const googleVideoMetadataSchema = z.object({
  /** Start offset as a duration in seconds, e.g. `'3.5s'`. */
  startOffset: z.string().optional(),
  /** End offset as a duration in seconds, e.g. `'10s'`. */
  endOffset: z.string().optional(),
  /** Frames per second in the range (0, 24]. Defaults to 1. */
  fps: z.number().gt(0).max(24).optional(),
  contentLayers: z.array(z.enum(['FRAMES', 'AUDIO', 'TRANSCRIPT'])).optional(),
});

export type GoogleVideoMetadata = z.infer<typeof googleVideoMetadataSchema>;

export const googleFilePartOptionsSchema = z.object({
  documentMetadata: z
    .object({
      /** Page numbers are 1-based and inclusive. */
      startPage: z.number().int().min(1).optional(),
      endPage: z.number().int().min(1).optional(),
      contentLayers: z.array(z.enum(['PAGE_IMAGE', 'PAGE_TEXT'])).optional(),
    })
    .optional(),
  spreadsheetMetadata: z
    .object({
      /** Sheet numbers are 1-based, in workbook order. */
      sheetIndex: z.number().int().min(1).optional(),
      /** An A1 range such as `A1:C5`. Does not limit the VISUAL layer. */
      visibleCells: z.string().optional(),
      contentLayers: z.array(z.enum(['DATA', 'FORMULAS', 'VISUAL'])).optional(),
    })
    .optional(),
  audioMetadata: z
    .object({
      startOffset: z.string().optional(),
      endOffset: z.string().optional(),
    })
    .optional(),
  videoMetadata: googleVideoMetadataSchema.optional(),
});

/** Per-file options for Gemini GenerateContent inputs. */
export type GoogleFilePartOptions = z.infer<typeof googleFilePartOptionsSchema>;

export function getGoogleFilePartOptions(
  options: Record<string, unknown> | undefined,
): GoogleFilePartOptions {
  return googleFilePartOptionsSchema.parse(
    Object.fromEntries(
      Object.entries(options ?? {}).filter(([, value]) => value != null),
    ),
  );
}
