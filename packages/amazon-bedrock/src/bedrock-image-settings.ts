export type BedrockImageModelId = 'amazon.nova-canvas-v1:0' | (string & {});

// https://docs.aws.amazon.com/nova/latest/userguide/image-gen-req-resp-structure.html
export const modelMaxImagesPerCall: Record<BedrockImageModelId, number> = {
  'amazon.nova-canvas-v1:0': 5,
};

export const BEDROCK_IMAGE_STYLES = [
  '3D_ANIMATED_FAMILY_FILM',
  'DESIGN_SKETCH',
  'FLAT_VECTOR_ILLUSTRATION',
  'GRAPHIC_NOVEL_ILLUSTRATION',
  'MAXIMALISM',
  'MIDCENTURY_RETRO',
  'PHOTOREALISM',
  'SOFT_DIGITAL_PAINTING',
] as const;

export type BedrockImageStyle = (typeof BEDROCK_IMAGE_STYLES)[number];
