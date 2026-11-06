import { z } from 'zod/v4';

const pageOptionsSchema = z.object({
  /** Page numbers are 1-based and inclusive. */
  startPage: z.number().int().min(1).optional(),
  endPage: z.number().int().min(1).optional(),
  contentLayers: z.array(z.enum(['page_image', 'page_text'])).optional(),
});

const spreadsheetOptionsSchema = z.object({
  /** Sheet numbers are 1-based, in workbook order. */
  sheetIndex: z.number().int().min(1).optional(),
  /** An A1 range such as `A1:C5`. Does not limit the visual layer. */
  visibleCells: z.string().optional(),
  contentLayers: z.array(z.enum(['data', 'formulas', 'visual'])).optional(),
});

export const googleInteractionsFileOptionsSchema = z.object({
  resolution: z.enum(['low', 'medium', 'high', 'ultra_high']).optional(),
  processing: z
    .union([
      z.enum(['agentic', 'static']),
      z.object({
        type: z.literal('static'),
        pageOptions: pageOptionsSchema.optional(),
        spreadsheetOptions: spreadsheetOptionsSchema.optional(),
        /** Offsets in seconds, converted to API duration strings. */
        startOffset: z.number().nonnegative().optional(),
        endOffset: z.number().nonnegative().optional(),
        fps: z.number().gt(0).max(24).optional(),
        contentLayers: z
          .array(z.enum(['frames', 'audio', 'transcript']))
          .optional(),
      }),
    ])
    .optional(),
});

/** Per-file inspection options for the Gemini Interactions API. */
export type GoogleInteractionsFileOptions = z.infer<
  typeof googleInteractionsFileOptionsSchema
>;
