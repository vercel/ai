import { z } from 'zod';

const WebSearchPreviewParameters = z.object({});

function webSearchPreviewTool({
  searchContextSize,
  userLocation,
}: {
  searchContextSize?: 'low' | 'medium' | 'high';
  userLocation?: {
    type?: 'approximate';
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
  };
} = {}): {
  type: 'provider-defined';
  id: 'openai.web_search_preview';
  args: {};
  parameters: typeof WebSearchPreviewParameters;
} {
  return {
    type: 'provider-defined',
    id: 'openai.web_search_preview',
    args: {
      searchContextSize,
      userLocation,
    },
    parameters: WebSearchPreviewParameters,
  };
}

const ImageGenerationParameters = z.object({});

function imageGenerationTool({
  background,
  input_image_mask,
  model,
  moderation,
  output_compression,
  output_format,
  partial_images,
  quality,
  size,
}: {
  background?: 'transparent' | 'opaque' | 'auto';
  input_image_mask?: {
    image_url?: string;
    file_id?: string;
  };
  model?: string;
  moderation?: string;
  output_compression?: number;
  output_format?: 'png' | 'webp' | 'jpeg';
  partial_images?: number;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  size?: '1024x1024' | '1024x1536' | '1536x1024' | 'auto';
} = {}): {
  type: 'provider-defined';
  id: 'openai.image_generation';
  args: {};
  parameters: typeof ImageGenerationParameters;
} {
  return {
    type: 'provider-defined',
    id: 'openai.image_generation',
    args: {
      background,
      input_image_mask,
      model,
      moderation,
      output_compression,
      output_format,
      partial_images,
      quality,
      size,
    },
    parameters: ImageGenerationParameters,
  };
}

export const openaiTools = {
  webSearchPreview: webSearchPreviewTool,
  imageGeneration: imageGenerationTool,
};
