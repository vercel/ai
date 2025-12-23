/**
 * Prodia job types for image generation.
 */
export type ProdiaImageModelId =
  | 'inference.flux-fast.schnell.txt2img.v2'
  | 'inference.flux.schnell.txt2img.v2'
  | 'inference.flux.dev.txt2img.v1'
  | 'inference.flux.schnell.img2img.v1'
  | 'inference.flux-2.flex.img2img.v1'
  | (string & {});
