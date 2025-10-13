import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_DownloadError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class DownloadError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly url: string;
  readonly statusCode?: number;
  readonly statusText?: string;
  readonly contentLength?: number;
  readonly maxSize?: number;

  constructor({
    url,
    statusCode,
    statusText,
    contentLength,
    maxSize,
    cause,
    message = cause == null
      ? statusCode != null
        ? `Failed to download ${url}: ${statusCode} ${statusText}`
        : contentLength != null && maxSize != null
          ? `Download size ${contentLength} bytes exceeds maximum allowed size of ${maxSize} bytes for ${url}`
          : `Failed to download ${url}`
      : `Failed to download ${url}: ${cause}`,
  }: {
    url: string;
    statusCode?: number;
    statusText?: string;
    contentLength?: number;
    maxSize?: number;
    message?: string;
    cause?: unknown;
  }) {
    super({ name, message, cause });

    this.url = url;
    this.statusCode = statusCode;
    this.statusText = statusText;
    this.contentLength = contentLength;
    this.maxSize = maxSize;
  }

  static isInstance(error: unknown): error is DownloadError {
    return AISDKError.hasMarker(error, marker);
  }
}
