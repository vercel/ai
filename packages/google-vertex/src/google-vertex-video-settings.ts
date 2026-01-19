export type GoogleVertexVideoModelId =
  | 'veo-001'
  | 'veo-002'
  | 'veo-003'
  | (string & {});

export const GoogleVertexVideoModels = {
  VEO_001: 'veo-001',
  VEO_002: 'veo-002',
  VEO_003: 'veo-003',
} as const;

export interface GoogleVertexVideoSettings {}
