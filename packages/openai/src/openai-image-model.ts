import { ImageModelV2, ImageModelV2CallWarning, DataContent, ImageInput } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  postJsonToApi,
  postFormDataToApi,
  convertBase64ToUint8Array,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { OpenAIConfig } from './openai-config';
import { openaiFailedResponseHandler } from './openai-error';
import {
  OpenAIImageModelId,
  modelMaxImagesPerCall,
  hasDefaultResponseFormat,
} from './openai-image-settings';

interface OpenAIImageModelConfig extends OpenAIConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class OpenAIImageModel implements ImageModelV2 {
  readonly specificationVersion = 'v2';

  get maxImagesPerCall(): number {
    return modelMaxImagesPerCall[this.modelId] ?? 1;
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: OpenAIImageModelId,
    private readonly config: OpenAIImageModelConfig,
  ) {}

  private createDataContentBlob(data: DataContent, mediaType: string = 'image/png'): Blob {
    if (typeof data === 'string') {
      // For base64 strings, decode to binary data
      return new Blob([convertBase64ToUint8Array(data)], { type: mediaType });
    } else if (data instanceof Uint8Array) {
      // For Uint8Array, create a Blob directly
      return new Blob([data], { type: mediaType });
    } else if (data instanceof ArrayBuffer) {
      // For ArrayBuffer, convert to Uint8Array first
      return new Blob([new Uint8Array(data)], { type: mediaType });
    } else {
      // For Buffer (Node.js), which is a subclass of Uint8Array
      return new Blob([Uint8Array.from(data as Buffer)], { type: mediaType });
    }
  }

  private getArgs({
    prompt,
    n,
    size,
    aspectRatio,
    seed,
    providerOptions,
    images,
    mask,
  }: Parameters<ImageModelV2['doGenerate']>[0]) {
    const isEdit = images != undefined && images.length > 0;
    const warnings: ImageModelV2CallWarning[] = [];

    // Handle common warnings
    if (aspectRatio != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details:
          'This model does not support aspect ratio. Use `size` instead.',
      });
    }

    if (seed != null && (!isEdit || this.modelId === 'dall-e-2')) {
      warnings.push({ type: 'unsupported-setting', setting: 'seed' });
    }

    // For edit operations, validate model support
    if (isEdit && !['dall-e-2', 'gpt-image-1'].includes(this.modelId)) {
      throw new Error(
        `Model ${this.modelId} does not support image editing. Only dall-e-2 and gpt-image-1 are supported.`,
      );
    }

    if (isEdit) {
      // Validate image count for dall-e-2
      if (this.modelId === 'dall-e-2' && images.length > 1) {
        throw new Error('dall-e-2 only supports editing a single image.');
      }

      // Create form data with base fields
      const formData = new FormData();
      formData.append('model', this.modelId);
      formData.append('prompt', prompt);
      if (n != null) formData.append('n', String(n));
      if (size != null) formData.append('size', size);

      // Handle image input
      for (let i = 0; i < images.length; i++) {
        const imgInput = images[i];
        const imageData = imgInput.image;
        
        // Handle URL case
        if (imageData instanceof URL) {
          throw new Error('URL images are not supported for OpenAI image editing. Please provide the image data directly.');
        }
        
        formData.append(`image[${i}]`, this.createDataContentBlob(imageData as DataContent, imgInput.mediaType));
      }

      // Handle mask if provided
      if (mask != null) {
        formData.append('mask', this.createDataContentBlob(mask));
      }

      // Add provider-specific options
      const openaiOptions = providerOptions.openai ?? {};
      for (const [key, value] of Object.entries(openaiOptions)) {
        if (value != null && typeof value !== 'object') {
          formData.append(key, String(value));
        } else if (value != null) {
          console.warn(`Skipping complex option ${key} - only primitive values supported in form data`);
        }
      }

      // For dall-e-2, we need to set response_format to b64_json
      if (this.modelId === 'dall-e-2') {
        formData.append('response_format', 'b64_json');
      }

      return {
        isEdit: true as const,
        formData,
        warnings,
      };
    } else {
      // Prepare JSON body for generation
      const body = {
        model: this.modelId,
        prompt,
        n,
        size,
        ...(providerOptions.openai ?? {}),
        ...(!hasDefaultResponseFormat.has(this.modelId)
          ? { response_format: 'b64_json' }
          : {}),
      };

      return {
        isEdit: false as const,
        body,
        warnings,
      };
    }
  }

  async doGenerate(
    options: Parameters<ImageModelV2['doGenerate']>[0]
  ): Promise<Awaited<ReturnType<ImageModelV2['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const args = this.getArgs(options);

    if (args.isEdit) {
      const { value: response, responseHeaders } = await postFormDataToApi({
        url: this.config.url({
          path: '/images/edits',
          modelId: this.modelId,
        }),
        headers: combineHeaders(this.config.headers(), options.headers),
        formData: args.formData,
        failedResponseHandler: openaiFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          openaiImageResponseSchema,
        ),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });

      return {
        images: (response as OpenAIImageResponse).data.map(item => item.b64_json),
        warnings: args.warnings,
        providerMetadata: {
          openai: {
            images: (response as OpenAIImageResponse).data.map(item => 
              item.revised_prompt ? { revisedPrompt: item.revised_prompt } : null
            ),
          },
        },
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    } else {
      // Handle JSON request for generation
      const { value: response, responseHeaders } = await postJsonToApi({
        url: this.config.url({
          path: '/images/generations',
          modelId: this.modelId,
        }),
        headers: combineHeaders(this.config.headers(), options.headers),
        body: args.body,
        failedResponseHandler: openaiFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          openaiImageResponseSchema,
        ),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });

      return {
        images: (response as OpenAIImageResponse).data.map(item => item.b64_json),
        warnings: args.warnings,
        providerMetadata: {
          openai: {
            images: (response as OpenAIImageResponse).data.map(item => 
              item.revised_prompt ? { revisedPrompt: item.revised_prompt } : null
            ),
          },
        },
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    }
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openaiImageResponseSchema = z.object({
  data: z.array(
    z.object({ b64_json: z.string(), revised_prompt: z.string().optional() }),
  ),
});

type OpenAIImageResponse = z.infer<typeof openaiImageResponseSchema>;
