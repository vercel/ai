export type ByteDanceVideoModelId =
  // Seedance 1.5
  | 'ep-20260125152958-7c9gf' // seedance-1.5-pro
  // Seedance 1.0 Pro
  | 'ep-20260125153237-hkvb4' // seedance-1.0-pro
  | 'ep-20260127025001-mgjjl' // seedance-1.0-pro-fast
  // Seedance 1.0 Lite
  | 'ep-20260127025543-bssxc' // seedance-1.0-lite (text-to-video)
  | 'ep-20260127025617-rrkm8' // seedance-1.0-lite (image-to-video)
  | (string & {});

export interface ByteDanceVideoSettings {}
