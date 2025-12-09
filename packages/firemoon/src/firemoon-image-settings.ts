export type FiremoonImageModelId =
  // FLUX models
  | 'flux/dev'
  | 'flux/schnell'
  | 'flux/pro'
  // Ideogram models
  | 'ideogram/v3'
  | 'ideogram/v3-turbo'
  | 'ideogram/v3-character-edit'
  // Kling video models
  | 'kling/kling-2-1-master'
  | 'kling/kling-1-6'
  // Minimax models
  | 'minimax/hailuo-02'
  | 'minimax/video-01'
  // Google Veo models
  | 'google/veo-3-fast'
  // Nano Banana models
  | 'nano-banana/nano-banan-edit'
  // Allow any string for custom models
  | (string & {});
