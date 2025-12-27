import {
  combineHeaders,
  createJsonResponseHandler,
  FetchFunction,
  type InferSchema,
  lazySchema,
  Resolvable,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { googleFailedResponseHandler } from './google-error';

/**
 * The processing state of a file uploaded to the Gemini File API.
 */
export type GoogleFileState = 'PROCESSING' | 'ACTIVE' | 'FAILED';

/**
 * Represents a file uploaded to the Gemini File API.
 */
export interface GoogleFile {
  /**
   * The unique identifier for the file in the format "files/{file_id}".
   */
  name: string;

  /**
   * The human-readable display name for the file.
   */
  displayName?: string;

  /**
   * The MIME type of the file.
   */
  mimeType: string;

  /**
   * The size of the file in bytes.
   */
  sizeBytes: string;

  /**
   * The timestamp when the file was created.
   */
  createTime: string;

  /**
   * The timestamp when the file was last updated.
   */
  updateTime: string;

  /**
   * The timestamp when the file will expire and be deleted.
   * Files are automatically deleted after 48 hours.
   */
  expirationTime: string;

  /**
   * The SHA-256 hash of the file content.
   */
  sha256Hash: string;

  /**
   * The URI to use when referencing the file in API calls.
   * This is the value to use in the `fileUri` field of content parts.
   */
  uri: string;

  /**
   * The current processing state of the file.
   * - PROCESSING: The file is being processed and is not yet ready for use.
   * - ACTIVE: The file has been processed and is ready for use.
   * - FAILED: The file processing failed.
   */
  state: GoogleFileState;

  /**
   * Error details if the file processing failed.
   */
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

// Helper function to get the file zod schema
const getFileZodSchema = () =>
  z.object({
    name: z.string(),
    displayName: z.string().optional(),
    mimeType: z.string(),
    sizeBytes: z.string(),
    createTime: z.string(),
    updateTime: z.string(),
    expirationTime: z.string(),
    sha256Hash: z.string(),
    uri: z.string(),
    state: z.enum(['PROCESSING', 'ACTIVE', 'FAILED']),
    error: z
      .object({
        code: z.number(),
        message: z.string(),
        status: z.string(),
      })
      .optional(),
  });

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const googleFileSchema = lazySchema(() => zodSchema(getFileZodSchema()));

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const googleFileResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      file: getFileZodSchema(),
    }),
  ),
);

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const googleListFilesResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      files: z.array(getFileZodSchema()).optional(),
      nextPageToken: z.string().optional(),
    }),
  ),
);

type GoogleFileResponse = InferSchema<typeof googleFileResponseSchema>;
type GoogleListFilesResponse = InferSchema<
  typeof googleListFilesResponseSchema
>;

// Helper to convert headers record to a format compatible with fetch
function prepareHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Options for uploading a file to the Gemini File API.
 */
export interface GoogleFileUploadOptions {
  /**
   * The file data to upload. Can be:
   * - A Buffer containing the file data
   * - A Uint8Array containing the file data
   * - A Blob (in browser environments)
   */
  file: Buffer | Uint8Array | Blob;

  /**
   * The MIME type of the file (e.g., "video/mp4", "audio/mp3", "application/pdf").
   */
  mimeType: string;

  /**
   * Optional human-readable display name for the file.
   */
  displayName?: string;
}

/**
 * Options for waiting for file processing to complete.
 */
export interface GoogleFileWaitOptions {
  /**
   * The interval in milliseconds between polling requests.
   * Default: 2000 (2 seconds)
   */
  pollInterval?: number;

  /**
   * The maximum time in milliseconds to wait for processing.
   * Default: 300000 (5 minutes)
   */
  maxWaitTime?: number;
}

/**
 * Options for listing files.
 */
export interface GoogleFileListOptions {
  /**
   * Maximum number of files to return per page.
   * Default: 10, Maximum: 100
   */
  pageSize?: number;

  /**
   * Page token from a previous list request.
   */
  pageToken?: string;
}

/**
 * Result from listing files.
 */
export interface GoogleFileListResult {
  /**
   * Array of files in the current page.
   */
  files: GoogleFile[];

  /**
   * Token to retrieve the next page of files, if available.
   */
  nextPageToken?: string;
}

/**
 * Configuration for the Google Files API client.
 */
type GoogleFilesConfig = {
  /**
   * The base URL for API calls.
   */
  baseURL: string;

  /**
   * Headers to include in API requests. Can be a static object or an async function.
   */
  headers: Resolvable<Record<string, string | undefined>>;

  /**
   * Optional custom fetch implementation for making HTTP requests.
   */
  fetch?: FetchFunction;
};

/**
 * Client for interacting with the Gemini File API.
 *
 * The File API allows you to upload files up to 2GB in size for use with
 * Gemini models. This is essential for processing large media files like
 * videos, audio, and large documents that exceed the 20MB inline request limit.
 *
 * Files are automatically deleted after 48 hours.
 *
 * @example
 * ```typescript
 * import { google } from '@ai-sdk/google';
 *
 * // Upload a video file
 * const file = await google.files.upload({
 *   file: videoBuffer,
 *   mimeType: 'video/mp4',
 *   displayName: 'my-video.mp4',
 * });
 *
 * // Wait for processing (required for videos)
 * const readyFile = await google.files.waitForProcessing(file.name);
 *
 * // Use in generation
 * const result = await generateText({
 *   model: google('gemini-2.5-flash'),
 *   messages: [{
 *     role: 'user',
 *     content: [
 *       { type: 'text', text: 'Summarize this video' },
 *       { type: 'file', data: new URL(readyFile.uri), mimeType: readyFile.mimeType },
 *     ],
 *   }],
 * });
 * ```
 */
export class GoogleFilesClient {
  private readonly config: GoogleFilesConfig;

  constructor(config: GoogleFilesConfig) {
    this.config = config;
  }

  /**
   * Uploads a file to the Gemini File API.
   *
   * Supports files up to 2GB in size. The file will be processed asynchronously
   * and may take some time before it's ready for use (especially for videos).
   *
   * @param options - Upload options including the file data and MIME type.
   * @returns The uploaded file metadata including its URI for use in API calls.
   * @throws {AI_APICallError} If the upload request fails.
   *
   * @example
   * ```typescript
   * const file = await google.files.upload({
   *   file: fs.readFileSync('./video.mp4'),
   *   mimeType: 'video/mp4',
   *   displayName: 'my-video.mp4',
   * });
   * console.log(file.uri); // Use this URI in your messages
   * ```
   */
  async upload(options: GoogleFileUploadOptions): Promise<GoogleFile> {
    const { file, mimeType, displayName } = options;
    const headers = await resolve(this.config.headers);

    // Convert file data to appropriate format
    let fileData: Blob;
    if (file instanceof Blob) {
      fileData = file;
    } else {
      fileData = new Blob([file], { type: mimeType });
    }

    const numBytes = fileData.size;

    // The upload endpoint uses a different URL pattern than the regular API.
    // It requires /upload/v1beta instead of just /v1beta.
    const uploadUrl = `${this.config.baseURL.replace('/v1beta', '')}/upload/v1beta/files`;

    const initResponse = await (this.config.fetch ?? fetch)(uploadUrl, {
      method: 'POST',
      headers: prepareHeaders(
        combineHeaders(headers, {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(numBytes),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json',
        }),
      ),
      body: JSON.stringify({
        file: {
          displayName: displayName,
        },
      }),
    });

    if (!initResponse.ok) {
      const { value: error } = await googleFailedResponseHandler({
        response: initResponse,
        url: uploadUrl,
        requestBodyValues: {},
      });
      throw error;
    }

    const uploadUrlFromHeader = initResponse.headers.get('X-Goog-Upload-URL');
    if (!uploadUrlFromHeader) {
      throw new Error('Failed to get upload URL from response headers');
    }

    // Step 2: Upload file data
    const uploadResponse = await (this.config.fetch ?? fetch)(
      uploadUrlFromHeader,
      {
        method: 'POST',
        headers: prepareHeaders(
          combineHeaders(headers, {
            'Content-Length': String(numBytes),
            'X-Goog-Upload-Offset': '0',
            'X-Goog-Upload-Command': 'upload, finalize',
          }),
        ),
        body: fileData,
      },
    );

    if (!uploadResponse.ok) {
      const { value: error } = await googleFailedResponseHandler({
        response: uploadResponse,
        url: uploadUrlFromHeader,
        requestBodyValues: {},
      });
      throw error;
    }

    const responseHandler = createJsonResponseHandler(googleFileResponseSchema);
    const { value: result } = await responseHandler({
      response: uploadResponse,
      url: uploadUrlFromHeader,
      requestBodyValues: {},
    });

    return result.file;
  }

  /**
   * Gets the current metadata and state of a file.
   *
   * @param fileName - The file name in the format "files/{file_id}".
   * @returns The current file metadata.
   * @throws {AI_APICallError} If the request fails or the file is not found.
   *
   * @example
   * ```typescript
   * const file = await google.files.get('files/abc123');
   * console.log(file.state); // 'PROCESSING', 'ACTIVE', or 'FAILED'
   * ```
   */
  async get(fileName: string): Promise<GoogleFile> {
    const headers = await resolve(this.config.headers);
    const url = `${this.config.baseURL}/${fileName}`;

    const response = await (this.config.fetch ?? fetch)(url, {
      method: 'GET',
      headers: prepareHeaders(combineHeaders(headers, {})),
    });

    if (!response.ok) {
      const { value: error } = await googleFailedResponseHandler({
        response,
        url,
        requestBodyValues: {},
      });
      throw error;
    }

    const responseHandler = createJsonResponseHandler(googleFileSchema);
    const { value: result } = await responseHandler({
      response,
      url,
      requestBodyValues: {},
    });

    return result;
  }

  /**
   * Lists files uploaded to the Gemini File API.
   *
   * @param options - Optional pagination options.
   * @returns A page of files and an optional next page token.
   * @throws {AI_APICallError} If the request fails.
   *
   * @example
   * ```typescript
   * const { files, nextPageToken } = await google.files.list({ pageSize: 20 });
   * for (const file of files) {
   *   console.log(file.name, file.state);
   * }
   * ```
   */
  async list(
    options: GoogleFileListOptions = {},
  ): Promise<GoogleFileListResult> {
    const headers = await resolve(this.config.headers);
    const params = new URLSearchParams();

    if (options.pageSize) {
      params.set('pageSize', String(options.pageSize));
    }
    if (options.pageToken) {
      params.set('pageToken', options.pageToken);
    }

    const queryString = params.toString();
    const url = `${this.config.baseURL}/files${queryString ? `?${queryString}` : ''}`;

    const response = await (this.config.fetch ?? fetch)(url, {
      method: 'GET',
      headers: prepareHeaders(combineHeaders(headers, {})),
    });

    if (!response.ok) {
      const { value: error } = await googleFailedResponseHandler({
        response,
        url,
        requestBodyValues: {},
      });
      throw error;
    }

    const responseHandler = createJsonResponseHandler(
      googleListFilesResponseSchema,
    );
    const { value: result } = await responseHandler({
      response,
      url,
      requestBodyValues: {},
    });

    return {
      files: result.files ?? [],
      nextPageToken: result.nextPageToken,
    };
  }

  /**
   * Deletes a file from the Gemini File API.
   *
   * Note: Files are automatically deleted after 48 hours, so manual deletion
   * is only necessary if you want to remove a file before it expires.
   *
   * @param fileName - The file name in the format "files/{file_id}".
   * @throws {AI_APICallError} If the request fails or the file is not found.
   *
   * @example
   * ```typescript
   * await google.files.delete('files/abc123');
   * ```
   */
  async delete(fileName: string): Promise<void> {
    const headers = await resolve(this.config.headers);
    const url = `${this.config.baseURL}/${fileName}`;

    const response = await (this.config.fetch ?? fetch)(url, {
      method: 'DELETE',
      headers: prepareHeaders(combineHeaders(headers, {})),
    });

    if (!response.ok) {
      const { value: error } = await googleFailedResponseHandler({
        response,
        url,
        requestBodyValues: {},
      });
      throw error;
    }
  }

  /**
   * Waits for a file to finish processing and become ACTIVE.
   *
   * This is particularly important for video files, which require processing
   * time before they can be used in generation requests. Processing can take
   * anywhere from a few seconds to several minutes depending on file size.
   *
   * @param fileName - The file name in the format "files/{file_id}".
   * @param options - Optional wait configuration.
   * @returns The file metadata once it reaches ACTIVE state.
   * @throws {AI_APICallError} If the API request to get file status fails.
   * @throws {Error} If the file processing fails or times out.
   *
   * @example
   * ```typescript
   * const file = await google.files.upload({
   *   file: videoBuffer,
   *   mimeType: 'video/mp4',
   * });
   *
   * // Wait for video processing (with custom timeout)
   * const readyFile = await google.files.waitForProcessing(file.name, {
   *   pollInterval: 3000,  // Check every 3 seconds
   *   maxWaitTime: 600000, // Wait up to 10 minutes
   * });
   * ```
   */
  async waitForProcessing(
    fileName: string,
    options: GoogleFileWaitOptions = {},
  ): Promise<GoogleFile> {
    const { pollInterval = 2000, maxWaitTime = 300000 } = options;
    const startTime = Date.now();

    while (true) {
      const file = await this.get(fileName);

      if (file.state === 'ACTIVE') {
        return file;
      }

      if (file.state === 'FAILED') {
        const errorMessage = file.error?.message ?? 'Unknown error';
        throw new Error(`File processing failed: ${errorMessage}`);
      }

      // Check timeout
      if (Date.now() - startTime > maxWaitTime) {
        throw new Error(
          `Timed out waiting for file processing after ${maxWaitTime}ms. ` +
            `Current state: ${file.state}`,
        );
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }
}

/**
 * Creates a Google Files client for interacting with the Gemini File API.
 *
 * @param config - Configuration options for the client.
 * @returns A configured GoogleFilesClient instance.
 */
export function createGoogleFilesClient(
  config: GoogleFilesConfig,
): GoogleFilesClient {
  return new GoogleFilesClient(config);
}
