import type { AIMessageChunk } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type {
  UIMessage,
  UIMessageChunk,
  ChatTransport,
  ChatRequestOptions,
} from 'ai';
import {
  RemoteGraph,
  type RemoteGraphParams,
} from '@langchain/langgraph/remote';
import { toBaseMessages, toUIMessageStream } from './adapter';

/**
 * Prepares the LangChain runnable configuration for a single
 * `sendMessages` call.
 */
export type PrepareRemoteGraphConfig<UI_MESSAGE extends UIMessage> = (
  options: Parameters<ChatTransport<UI_MESSAGE>['sendMessages']>[0],
) => RunnableConfig | PromiseLike<RunnableConfig>;

/**
 * Options for configuring a LangSmith deployment transport.
 * Extends RemoteGraphParams but makes graphId optional (defaults to 'agent').
 */
export type LangSmithDeploymentTransportOptions<
  UI_MESSAGE extends UIMessage = UIMessage,
> = Omit<RemoteGraphParams, 'graphId'> & {
  /**
   * The ID of the graph to connect to.
   * @default 'agent'
   */
  graphId?: string;

  /**
   * Prepares LangChain runnable configuration for each `sendMessages` call.
   *
   * Use this to map request-specific chat context to LangGraph configuration,
   * such as a thread ID, tracing metadata, or tags.
   */
  prepareRemoteGraphConfig?: PrepareRemoteGraphConfig<UI_MESSAGE>;
};

/**
 * A ChatTransport implementation for LangSmith/LangGraph deployments.
 *
 * This transport enables seamless integration between the AI SDK's useChat hook
 * and LangSmith deployed LangGraph agents.
 *
 * @example
 * ```ts
 * import { LangSmithDeploymentTransport } from '@ai-sdk/langchain';
 *
 * // Use with useChat
 * const { messages, input, handleSubmit } = useChat({
 *   transport: new LangSmithDeploymentTransport({
 *     url: 'https://your-deployment.us.langgraph.app',
 *     apiKey: 'my-api-key',
 *   }),
 * });
 * ```
 */
export class LangSmithDeploymentTransport<
  UI_MESSAGE extends UIMessage,
> implements ChatTransport<UI_MESSAGE> {
  protected graph: RemoteGraph;
  private readonly prepareRemoteGraphConfig?: PrepareRemoteGraphConfig<UI_MESSAGE>;

  constructor(options: LangSmithDeploymentTransportOptions<UI_MESSAGE>) {
    const { graphId, prepareRemoteGraphConfig, ...remoteGraphOptions } =
      options;

    this.prepareRemoteGraphConfig = prepareRemoteGraphConfig;
    this.graph = new RemoteGraph({
      ...remoteGraphOptions,
      graphId: graphId ?? 'agent',
    });
  }

  async sendMessages(
    options: {
      trigger: 'submit-message' | 'regenerate-message';
      chatId: string;
      messageId: string | undefined;
      messages: UI_MESSAGE[];
      abortSignal: AbortSignal | undefined;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk>> {
    const baseMessages = await toBaseMessages(options.messages);
    const config = await this.prepareRemoteGraphConfig?.(options);

    const stream = await this.graph.stream(
      { messages: baseMessages },
      {
        ...config,
        // These modes are required by toUIMessageStream.
        streamMode: ['values', 'messages'],
      },
    );

    return toUIMessageStream(
      stream as AsyncIterable<AIMessageChunk> | ReadableStream,
    );
  }

  async reconnectToStream(
    _options: {
      chatId: string;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    throw new Error('Method not implemented.');
  }
}
