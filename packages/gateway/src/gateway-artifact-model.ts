import {
  APICallError,
  type Experimental_ArtifactModelV4 as ArtifactModelV4,
  type Experimental_ArtifactModelV4ArtifactData,
  type Experimental_ArtifactModelV4CallOptions,
  type Experimental_ArtifactModelV4File,
  type SharedV4ProviderMetadata,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  parseJsonEventStream,
  postJsonToApi,
  resolve,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { GatewayConfig } from './gateway-config';
import { asGatewayError } from './errors';
import { parseAuthMethod } from './errors/parse-auth-method';

export class GatewayArtifactModel implements ArtifactModelV4 {
  readonly specificationVersion = 'v4' as const;

  constructor(
    readonly modelId: string,
    private readonly config: GatewayConfig & {
      provider: string;
      o11yHeaders: Resolvable<Record<string, string>>;
    },
  ) {}

  get provider(): string {
    return this.config.provider;
  }

  async doGenerate({
    prompt,
    inputs,
    providerOptions,
    headers,
    abortSignal,
  }: Experimental_ArtifactModelV4CallOptions): Promise<{
    artifacts: Experimental_ArtifactModelV4ArtifactData[];
    warnings: SharedV4Warning[];
    providerMetadata?: SharedV4ProviderMetadata;
    response: {
      timestamp: Date;
      modelId: string;
      headers: Record<string, string> | undefined;
    };
  }> {
    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;

    try {
      const { responseHeaders, value: responseBody } = await postJsonToApi({
        url: this.getUrl(),
        headers: combineHeaders(
          resolvedHeaders,
          headers ?? {},
          this.getModelConfigHeaders(),
          await resolve(this.config.o11yHeaders),
          { accept: 'text/event-stream, application/json' },
        ),
        body: {
          ...(prompt != null && { prompt }),
          ...(inputs != null && {
            inputs: inputs.map(maybeEncodeArtifactFile),
          }),
          providerOptions,
        },
        successfulResponseHandler: handleArtifactResponse,
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => data,
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        artifacts: responseBody.artifacts,
        warnings: responseBody.warnings ?? [],
        providerMetadata:
          responseBody.providerMetadata as SharedV4ProviderMetadata,
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  private getUrl(): string {
    return `${this.config.baseURL}/artifact-model`;
  }

  private getModelConfigHeaders(): Record<string, string> {
    return {
      'ai-artifact-model-specification-version': '4',
      'ai-model-id': this.modelId,
    };
  }
}

function maybeEncodeArtifactFile(file: Experimental_ArtifactModelV4File) {
  if (file.type === 'file' && file.data instanceof Uint8Array) {
    return {
      ...file,
      data: convertUint8ArrayToBase64(file.data),
    };
  }

  return file;
}

const providerMetadataEntrySchema = z.object({}).catchall(z.unknown());

const gatewayArtifactDataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('url'),
    url: z.string(),
    mediaType: z.string(),
    filename: z.string().optional(),
    role: z.string().optional(),
  }),
  z.object({
    type: z.literal('base64'),
    data: z.string(),
    mediaType: z.string(),
    filename: z.string().optional(),
    role: z.string().optional(),
  }),
  z.object({
    type: z.literal('binary'),
    data: z
      .array(z.number().int().min(0).max(255))
      .transform(data => new Uint8Array(data)),
    mediaType: z.string(),
    filename: z.string().optional(),
    role: z.string().optional(),
  }),
]);

const gatewayArtifactWarningSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('unsupported'),
    feature: z.string(),
    details: z.string().optional(),
  }),
  z.object({
    type: z.literal('compatibility'),
    feature: z.string(),
    details: z.string().optional(),
  }),
  z.object({
    type: z.literal('deprecated'),
    setting: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('other'),
    message: z.string(),
  }),
]);

const gatewayArtifactResultSchema = z.object({
  type: z.literal('result').optional(),
  artifacts: z.array(gatewayArtifactDataSchema),
  warnings: z.array(gatewayArtifactWarningSchema).optional(),
  providerMetadata: z
    .record(z.string(), providerMetadataEntrySchema)
    .optional(),
});

const gatewayArtifactEventSchema = z.discriminatedUnion('type', [
  gatewayArtifactResultSchema.extend({ type: z.literal('result') }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
    errorType: z.string(),
    statusCode: z.number(),
    param: z.unknown().nullable(),
  }),
]);

async function handleArtifactResponse({
  response,
  url,
  requestBodyValues,
}: {
  url: string;
  requestBodyValues: unknown;
  response: Response;
}) {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    return createJsonResponseHandler(gatewayArtifactResultSchema)({
      response,
      url,
      requestBodyValues,
    });
  }

  if (response.body == null) {
    throw new APICallError({
      message: 'SSE response body is empty',
      url,
      requestBodyValues,
      statusCode: response.status,
    });
  }

  const eventStream = parseJsonEventStream({
    stream: response.body,
    schema: gatewayArtifactEventSchema,
  });
  const reader = eventStream.getReader();
  const { done, value: parseResult } = await reader.read();
  reader.releaseLock();

  if (done || parseResult == null) {
    throw new APICallError({
      message: 'SSE stream ended without a data event',
      url,
      requestBodyValues,
      statusCode: response.status,
    });
  }

  if (!parseResult.success) {
    throw new APICallError({
      message: 'Failed to parse artifact SSE event',
      cause: parseResult.error,
      url,
      requestBodyValues,
      statusCode: response.status,
    });
  }

  const event = parseResult.value;
  if (event.type === 'error') {
    throw new APICallError({
      message: event.message,
      statusCode: event.statusCode,
      url,
      requestBodyValues,
      responseHeaders: Object.fromEntries([...response.headers]),
      responseBody: JSON.stringify(event),
      data: {
        error: {
          message: event.message,
          type: event.errorType,
          param: event.param,
        },
      },
    });
  }

  return {
    value: {
      artifacts: event.artifacts,
      warnings: event.warnings,
      providerMetadata: event.providerMetadata,
    },
    responseHeaders: Object.fromEntries([...response.headers]),
  };
}
