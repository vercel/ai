import {
  combineHeaders,
  createJsonResponseHandler,
  getFromApi,
  postJsonToApi,
  removeUndefinedEntries,
} from '@ai-sdk/provider-utils';
import { OpenAIConfig } from '../openai-config';
import { openaiFailedResponseHandler } from '../openai-error';
import {
  Conversation,
  ConversationItem,
  ConversationItemList,
  CreateItemsRequest,
  ListItemsOptions,
  RetrieveItemOptions,
  conversationItemListSchema,
  conversationItemSchema,
  conversationSchema,
} from './openai-conversations-types';

export class OpenAIConversationItems {
  constructor(private readonly config: OpenAIConfig) {}

  private getUrl(path: string): string {
    const baseUrl = this.config
      .url({ path: '', modelId: '' })
      .replace(/\/$/, '');
    return `${baseUrl}${path}`;
  }

  async list(
    conversationId: string,
    options: ListItemsOptions & {
      headers?: Record<string, string>;
      abortSignal?: AbortSignal;
    } = {},
  ): Promise<ConversationItemList> {
    const { headers, abortSignal, ...listOptions } = options;

    const searchParams = new URLSearchParams();
    if (listOptions.after) searchParams.set('after', listOptions.after);
    if (listOptions.limit !== undefined)
      searchParams.set('limit', listOptions.limit.toString());
    if (listOptions.order) searchParams.set('order', listOptions.order);
    if (listOptions.include) {
      listOptions.include.forEach(include =>
        searchParams.append('include', include),
      );
    }

    const url = `${this.getUrl(`/conversations/${conversationId}/items`)}${
      searchParams.toString() ? `?${searchParams.toString()}` : ''
    }`;

    const { value: response } = await getFromApi({
      url,
      headers: combineHeaders(this.config.headers(), headers),
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        conversationItemListSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return response;
  }

  async create(
    conversationId: string,
    request: CreateItemsRequest,
    options: {
      include?: Array<
        | 'code_interpreter_call.outputs'
        | 'computer_call_output.output.image_url'
        | 'file_search_call.results'
        | 'message.input_image.image_url'
        | 'message.output_text.logprobs'
        | 'reasoning.encrypted_content'
      >;
      headers?: Record<string, string>;
      abortSignal?: AbortSignal;
    } = {},
  ): Promise<ConversationItemList> {
    const { headers, abortSignal, include } = options;

    const searchParams = new URLSearchParams();
    if (include) {
      include.forEach(includeItem =>
        searchParams.append('include', includeItem),
      );
    }

    const url = `${this.getUrl(`/conversations/${conversationId}/items`)}${
      searchParams.toString() ? `?${searchParams.toString()}` : ''
    }`;

    const { value: response } = await postJsonToApi({
      url,
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        items: request.items,
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        conversationItemListSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return response;
  }

  async retrieve(
    conversationId: string,
    itemId: string,
    options: RetrieveItemOptions & {
      headers?: Record<string, string>;
      abortSignal?: AbortSignal;
    } = {},
  ): Promise<ConversationItem> {
    const { headers, abortSignal, ...retrieveOptions } = options;

    const searchParams = new URLSearchParams();
    if (retrieveOptions.include) {
      retrieveOptions.include.forEach(include =>
        searchParams.append('include', include),
      );
    }

    const url = `${this.getUrl(`/conversations/${conversationId}/items/${itemId}`)}${
      searchParams.toString() ? `?${searchParams.toString()}` : ''
    }`;

    const { value: response } = await getFromApi({
      url,
      headers: combineHeaders(this.config.headers(), headers),
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        conversationItemSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return response;
  }

  async delete(
    conversationId: string,
    itemId: string,
    options: {
      headers?: Record<string, string>;
      abortSignal?: AbortSignal;
    } = {},
  ): Promise<Conversation> {
    const response = await (this.config.fetch ?? fetch)(
      this.getUrl(`/conversations/${conversationId}/items/${itemId}`),
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
        url: this.getUrl(`/conversations/${conversationId}/items/${itemId}`),
        requestBodyValues: {},
      });
      throw errorHandler.value;
    }

    return (await response.json()) as Conversation;
  }
}
