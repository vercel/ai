export class DownloadError extends Error {
  readonly url: string;
  readonly statusCode?: number;
  readonly statusText?: string;
  readonly cause?: unknown;

  constructor({
    url,
    statusCode,
    statusText,
    cause,
    message = cause == null
      ? `Failed to download ${url}: ${statusCode} ${statusText}`
      : `Failed to download ${url}: ${cause}`,
  }: {
    url: string;
    statusCode?: number;
    statusText?: string;
    message?: string;
    cause?: unknown;
  }) {
    super(message);

    this.name = 'AI_DownloadError';

    this.url = url;
    this.statusCode = statusCode;
    this.statusText = statusText;
    this.cause = cause;
  }

  static isDownloadError(error: unknown): error is DownloadError {
    return (
      error instanceof Error &&
      error.name === 'AI_DownloadError' &&
      typeof (error as DownloadError).url === 'string' &&
      ((error as DownloadError).statusCode == null ||
        typeof (error as DownloadError).statusCode === 'number') &&
      ((error as DownloadError).statusText == null ||
        typeof (error as DownloadError).statusText === 'string')
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      url: this.url,
      statusCode: this.statusCode,
      statusText: this.statusText,
      cause: this.cause,
    };
  }
}
