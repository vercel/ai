/**
 * Prodia job types for video generation.
 */
export type ProdiaVideoModelId =
  | 'inference.minimax.h3.fast.txt2vid.v1'
  | 'inference.minimax.h3.fast.img2vid.v1'
  | 'inference.minimax.h3.fast.ref2vid.v1'
  | 'inference.wan2-2.lightning.txt2vid.v0'
  | 'inference.wan2-2.lightning.img2vid.v0'
  | (string & {});
