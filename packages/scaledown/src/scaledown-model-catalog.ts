const modelIds = {
  decision: ['classify', 'classify-1'],
  extraction: ['extract', 'extract-1'],
} as const;

/** Known model IDs, derived from the catalog declarations. */
export type ScaleDownModelIds = {
  [Type in keyof typeof modelIds]: (typeof modelIds)[Type][number];
};
