import {
  combineHeaders,
  createJsonResponseHandler,
  getFromApi,
  postJsonToApi,
  removeUndefinedEntries,
} from '@ai-sdk/provider-utils';
import { OpenAIConfig } from '../openai-config';
import { openaiFailedResponseHandler } from '../openai-error';
import { OpenAIConversationItems } from './openai-conversations-items';
import {
  Conversation,
  CreateConversationRequest,
  DeletedConversation,
  UpdateConversationRequest,
  conversationSchema,
  deletedConversationSchema,
} from './openai-conversations-types';

export class OpenAIConversations {
  private readonly config: OpenAIConfig;
  readonly items: OpenAIConversationItems;

  constructor(config: OpenAIConfig) {
    this.config = config;
    this.items = new OpenAIConversationItems(config);
  }

  private getUrl(path: string): string {
    const baseUrl = this.config
      .url({ path: '', modelId: '' })
      .replace(/\/$/, '');
    return `${baseUrl}${path}`;
  }

  async create(
    request: CreateConversationRequest = {},
    options: {
      headers?: Record<string, string>;
      abortSignal?: AbortSignal;
    } = {},
  ): Promise<Conversation> {
    const { value: response } = await postJsonToApi({
      url: this.getUrl('/conversations'),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...(request.items && { items: request.items }),
        ...(request.metadata && { metadata: request.metadata }),
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(conversationSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return response;
  }

  async retrieve(
    conversationId: string,
    options: {
      headers?: Record<string, string>;
      abortSignal?: AbortSignal;
    } = {},
  ): Promise<Conversation> {
    const { value: response } = await getFromApi({
      url: this.getUrl(`/conversations/${conversationId}`),
      headers: combineHeaders(this.config.headers(), options.headers),
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(conversationSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return response;
  }

  async update(
    conversationId: string,
    request: UpdateConversationRequest,
    options: {
      headers?: Record<string, string>;
      abortSignal?: AbortSignal;
    } = {},
  ): Promise<Conversation> {
    const { value: response } = await postJsonToApi({
      url: this.getUrl(`/conversations/${conversationId}`),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        metadata: request.metadata,
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(conversationSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return response;
  }

  async delete(
    conversationId: string,
    options: {
      headers?: Record<string, string>;
      abortSignal?: AbortSignal;
    } = {},
  ): Promise<DeletedConversation> {
    const response = await (this.config.fetch ?? fetch)(
      this.getUrl(`/conversations/${conversationId}`),
      {
        method: 'DELETE',
        headers: removeUndefinedEntries(
          combineHeaders(this.config.headers(), options.headers),
        ),
        signal: options.abortSignal,
      },
    );

    if (!response.ok) {
      const errorHandler = await openaiFailedResponseHandler({
        response,
        url: this.getUrl(`/conversations/${conversationId}`),
        requestBodyValues: {},
      });
      throw errorHandler.value;
    }

    return (await response.json()) as DeletedConversation;
  }
}
