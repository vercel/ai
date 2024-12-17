import { ImageModelV1, JSONValue } from '@ai-sdk/provider';
import { Resolvable, resolve } from '@ai-sdk/provider-utils';

export type GoogleVertexImageModelId =
  | 'imagen-3.0-generate-001'
  | 'imagen-3.0-fast-generate-001';

interface GoogleVertexImageModelOptions {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: typeof fetch;
}

// https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images
export class GoogleVertexImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.options.provider;
  }

  constructor(
    readonly modelId: GoogleVertexImageModelId,
    private options: GoogleVertexImageModelOptions,
  ) {}

  async doGenerate(options: {
    prompt: string;
    n: number;
    size: `${number}x${number}` | undefined;
    providerOptions: Record<string, Record<string, JSONValue>>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{ images: string[] }> {
    const [width, height] = (options.size ?? '1024x1024')
      .split('x')
      .map(Number);

    const response = await (this.options.fetch ?? fetch)(
      `${this.options.baseURL}/models/${this.modelId}:predict`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await resolve(this.options.headers)),
          ...options.headers,
        },
        signal: options.abortSignal,
        body: JSON.stringify({
          instances: [{ prompt: options.prompt }],
          parameters: {
            sampleCount: options.n,
            aspectRatio: this.getAspectRatio(width, height),
            ...options.providerOptions,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return {
      images: data.predictions.map(
        (p: { bytesBase64Encoded: string }) => p.bytesBase64Encoded,
      ),
    };
  }

  private getAspectRatio(width: number, height: number): string {
    // Map common dimensions to Imagen's supported aspect ratios
    if (width === height) return '1:1';
    if (width === 896 && height === 1280) return '3:4';
    if (width === 1280 && height === 896) return '4:3';
    if (width === 768 && height === 1408) return '9:16';
    if (width === 1408 && height === 768) return '16:9';

    // Default to 1:1 if no match
    return '1:1';
  }
}
