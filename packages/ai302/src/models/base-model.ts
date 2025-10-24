import {
  ImageModelV2,
  type ImageModelV2CallOptions,
  type ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import type {
  AI302ImageModelId,
  AI302ImageSettings,
} from '../ai302-image-settings';
import type { ImageSize } from '../ai302-types';
import { AI302Config } from '../ai302-config';

export abstract class BaseModelHandler {
  constructor(
    readonly modelId: AI302ImageModelId,
    readonly settings: AI302ImageSettings,
    readonly config: AI302Config,
  ) {}

  public async handleRequest(
    params: ImageModelV2CallOptions,
  ): Promise<Awaited<ReturnType<ImageModelV2['doGenerate']>>> {
    const { headers, ...rest } = params;
    const requestHeaders = headers
      ? Object.fromEntries(
          Object.entries(headers)
            .filter(([_, v]) => v !== undefined)
            .map(([k, v]) => [k, v as string]),
        )
      : undefined;

    return this.processRequest({
      ...rest,
      headers: requestHeaders,
    });
  }

  protected abstract processRequest(
    params: ImageModelV2CallOptions,
  ): Promise<Awaited<ReturnType<ImageModelV2['doGenerate']>>>;

  protected parseSize(size: string | undefined): ImageSize | undefined {
    if (!size) return undefined;
    const [width, height] = size.split('x').map(Number);
    return { width, height };
  }

  protected validateAspectRatio(
    aspectRatio: string | undefined,
    warnings: ImageModelV2CallWarning[],
    maxRatio?: number,
    minRatio?: number,
  ): string | undefined {
    if (!aspectRatio) return undefined;

    const [width, height] = aspectRatio.split(':').map(Number);
    if (!width || !height) return undefined;

    if (maxRatio === undefined || minRatio === undefined) {
      return aspectRatio;
    }

    const ratio = width / height;

    if (ratio >= minRatio && ratio <= maxRatio) {
      return aspectRatio;
    }

    let adjustedWidth: number;
    let adjustedHeight: number;

    if (ratio > maxRatio) {
      adjustedHeight = 9;
      adjustedWidth = Math.round(maxRatio * adjustedHeight);
    } else {
      adjustedWidth = 9;
      adjustedHeight = Math.round(adjustedWidth / minRatio);
    }

    warnings.push({
      type: 'other',
      message: `Aspect ratio ${aspectRatio} is outside the allowed range (${adjustedWidth}:${adjustedHeight} to ${adjustedHeight}:${adjustedWidth}). Adjusted to ${adjustedWidth}:${adjustedHeight}`,
    });

    return `${adjustedWidth}:${adjustedHeight}`;
  }

  protected aspectRatioToSize(
    aspectRatio: string | undefined,
    baseSize: number = 1024,
    warnings: ImageModelV2CallWarning[],
  ): ImageSize | undefined {
    if (!aspectRatio) return undefined;

    const validatedAspectRatio = this.validateAspectRatio(
      aspectRatio,
      warnings,
    );
    if (!validatedAspectRatio) return undefined;

    const [width, height] = validatedAspectRatio.split(':').map(Number);
    if (!width || !height) return undefined;

    const ratio = width / height;

    if (ratio > 1) {
      return { width: baseSize, height: Math.round(baseSize / ratio) };
    } else {
      return { width: Math.round(baseSize * ratio), height: baseSize };
    }
  }

  protected async downloadImage(url: string): Promise<string> {
    const maxRetries = 5;
    const timeout = 120000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const controller = new AbortController();
      try {
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const imageResponse = await fetch(url, {
          signal: controller.signal,
          headers: {
            Accept: 'image/*',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        clearTimeout(timeoutId);

        if (!imageResponse.ok) {
          throw new Error(`HTTP error! status: ${imageResponse.status}`);
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        return base64;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        if (attempt === maxRetries - 1) {
          throw new Error(
            `Failed to download image after ${maxRetries} attempts: ${errorMessage}`,
          );
        }

        const delay = Math.min(
          2 ** attempt * 2000 + Math.random() * 1000,
          30000,
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        controller.abort();
      }
    }
    throw new Error('Failed to download image after retries');
  }

  protected async downloadImages(urls: string[]): Promise<string[]> {
    const imagePromises = urls.map(async url => {
      try {
        return await this.downloadImage(url);
      } catch (error) {
        return null;
      }
    });

    const base64Images = await Promise.all(imagePromises);
    const validImages = base64Images.filter(Boolean) as string[];

    if (validImages.length === 0) {
      throw new Error('All image downloads failed');
    }

    return validImages;
  }

  protected validateSizeOption(
    parsedSize: ImageSize,
    supportedSizes: string[],
    warnings: ImageModelV2CallWarning[],
  ): ImageSize {
    const validatedSize = this.validateDimensionsMultipleOf32(
      parsedSize,
      warnings,
    );

    const sizeStr = `${validatedSize.width}x${validatedSize.height}`;
    if (!supportedSizes.includes(sizeStr)) {
      const closestSize = this.findClosestSize(validatedSize, supportedSizes);
      warnings.push({
        type: 'other',
        message: `Size ${sizeStr} is not supported. Using closest supported size: ${closestSize}`,
      });
      const [width, height] = closestSize.split('x').map(Number);
      return { width, height };
    }
    return validatedSize;
  }

  protected validateDimensionsMultipleOf32(
    size: ImageSize,
    warnings: ImageModelV2CallWarning[],
    minSize: number = 32,
    maxSize: number = 4096,
  ): ImageSize {
    const adjustDimension = (value: number): number => {
      if (value < minSize) {
        return minSize;
      }
      if (value > maxSize) {
        return maxSize;
      }
      if (value % 32 !== 0) {
        const roundedValue = Math.round(value / 32) * 32;
        return Math.min(maxSize, Math.max(minSize, roundedValue));
      }
      return value;
    };

    const adjustedWidth = adjustDimension(size.width);
    const adjustedHeight = adjustDimension(size.height);

    if (adjustedWidth !== size.width || adjustedHeight !== size.height) {
      warnings.push({
        type: 'other',
        message: `Image dimensions must be multiples of 32 and within the range ${minSize}-${maxSize}. Adjusted from ${size.width}x${size.height} to ${adjustedWidth}x${adjustedHeight}`,
      });
      return { width: adjustedWidth, height: adjustedHeight };
    }

    return size;
  }

  protected findClosestSize(size: ImageSize, supportedSizes: string[]): string {
    const targetRatio = size.width / size.height;

    const sizesByRatio = supportedSizes.slice().sort((a, b) => {
      const [w1, h1] = a.split('x').map(Number);
      const [w2, h2] = b.split('x').map(Number);
      const ratio1 = w1 / h1;
      const ratio2 = w2 / h2;
      const diff1 = Math.abs(ratio1 - targetRatio);
      const diff2 = Math.abs(ratio2 - targetRatio);
      return diff1 - diff2;
    });

    const similarRatioSizes = sizesByRatio.slice(0, 2);
    return similarRatioSizes.reduce((closest, current) => {
      const [w1, h1] = current.split('x').map(Number);
      const [w2, h2] = closest.split('x').map(Number);

      const diff1 = Math.abs(Math.max(w1, h1) - 1024);
      const diff2 = Math.abs(Math.max(w2, h2) - 1024);

      return diff1 < diff2 ? current : closest;
    });
  }

  protected findClosestAspectRatio(
    targetRatio: `${number}:${number}` | undefined,
    supportedRatios: readonly `${number}:${number}`[],
    warnings: ImageModelV2CallWarning[],
  ): `${number}:${number}` {
    if (!targetRatio) return supportedRatios[0];

    const [targetWidth, targetHeight] = targetRatio.split(':').map(Number);
    if (!targetWidth || !targetHeight) return supportedRatios[0];

    const targetValue = targetWidth / targetHeight;
    let closestRatio = supportedRatios[0];
    let minDiff = Infinity;

    for (const ratio of supportedRatios) {
      const [w, h] = ratio.split(':').map(Number);
      if (!w || !h) continue;

      const currentValue = w / h;
      const diff = Math.abs(currentValue - targetValue);

      if (diff < minDiff) {
        minDiff = diff;
        closestRatio = ratio;
      }
    }

    if (closestRatio !== targetRatio) {
      warnings.push({
        type: 'other',
        message: `Aspect ratio ${targetRatio} is not supported. Using closest supported ratio: ${closestRatio}`,
      });
    }

    return closestRatio;
  }

  protected sizeToAspectRatio(
    size: string | undefined,
    supportedRatios: readonly string[],
    warnings: ImageModelV2CallWarning[],
  ): string | undefined {
    if (!size) return undefined;

    const parsedSize = this.parseSize(size);
    if (!parsedSize) {
      warnings.push({
        type: 'other',
        message: `Invalid size format: ${size}. Expected format: WIDTHxHEIGHT`,
      });
      return undefined;
    }

    const ratio = parsedSize.width / parsedSize.height;

    // Find the closest supported aspect ratio
    let closestRatio = supportedRatios[0];
    let minDiff = Infinity;

    for (const aspectRatio of supportedRatios) {
      const [w, h] = aspectRatio.split(':').map(Number);
      if (!w || !h) continue;

      const currentRatio = w / h;
      const diff = Math.abs(currentRatio - ratio);

      if (diff < minDiff) {
        minDiff = diff;
        closestRatio = aspectRatio;
      }
    }

    // Check if conversion was needed
    const [closestW, closestH] = closestRatio.split(':').map(Number);
    const closestRatioValue = closestW / closestH;

    if (Math.abs(closestRatioValue - ratio) > 0.05) {
      // 5% tolerance
      warnings.push({
        type: 'other',
        message: `Size ${size} (ratio ${ratio.toFixed(2)}) converted to closest supported aspect ratio: ${closestRatio}`,
      });
    }

    return closestRatio;
  }
}
