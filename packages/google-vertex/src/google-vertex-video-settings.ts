export type GoogleVertexVideoModelId =
  | 'veo-001'
  | 'veo-002'
  | 'veo-003'
  | 'veo-2.0-generate-001'
  | 'veo-2.0-generate-exp'
  | 'veo-2.0-generate-preview'
  | 'veo-3.0-generate-001'
  | 'veo-3.0-fast-generate-001'
  | 'veo-3.0-generate-preview'
  | 'veo-3.0-fast-generate-preview'
  | 'veo-3.1-generate-001'
  | 'veo-3.1-fast-generate-001'
  | 'veo-3.1-generate-preview'
  | 'veo-3.1-fast-generate-preview'
  | (string & {});

export const GoogleVertexVideoModels = {
  VEO_001: 'veo-001',
  VEO_002: 'veo-002',
  VEO_003: 'veo-003',
  VEO_2_0_GENERATE_001: 'veo-2.0-generate-001',
  VEO_2_0_GENERATE_EXP: 'veo-2.0-generate-exp',
  VEO_2_0_GENERATE_PREVIEW: 'veo-2.0-generate-preview',
  VEO_3_0_GENERATE_001: 'veo-3.0-generate-001',
  VEO_3_0_FAST_GENERATE_001: 'veo-3.0-fast-generate-001',
  VEO_3_0_GENERATE_PREVIEW: 'veo-3.0-generate-preview',
  VEO_3_0_FAST_GENERATE_PREVIEW: 'veo-3.0-fast-generate-preview',
  VEO_3_1_GENERATE_001: 'veo-3.1-generate-001',
  VEO_3_1_FAST_GENERATE_001: 'veo-3.1-fast-generate-001',
  VEO_3_1_GENERATE_PREVIEW: 'veo-3.1-generate-preview',
  VEO_3_1_FAST_GENERATE_PREVIEW: 'veo-3.1-fast-generate-preview',
} as const;

export interface GoogleVertexVideoSettings {}
