export type FiremoonImageModelId =
  // FLUX models
  | 'flux/dev'
  | 'flux/schnell'
  | 'flux/pro'
  // Ideogram models
  | 'ideogram/v3'
  | 'ideogram/v3-turbo'
  | 'ideogram/v3-character-edit'
  // Minimax models
  | 'minimax/hailuo-02'
  // Nano Banana models
  | 'nano-banana/nano-banan-edit'
  // Nano Banana models
  | 'nano-banana/nano-banan-edit'
  // Allow any string for custom models
  | (string & {});
