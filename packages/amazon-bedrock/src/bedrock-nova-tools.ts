import { LanguageModelV3ProviderDefinedTool } from '@ai-sdk/provider';

/**
 * Nova-specific tools that can be used with Nova models on Amazon Bedrock.
 * These are system tools that are executed by the Bedrock service.
 */
export const novaTools = {
  /**
   * Nova Web Grounding tool for real-time web search and information retrieval.
   * This is a system tool that is executed by the Bedrock service.
   *
   * Web Grounding provides a turnkey RAG option that allows Nova models to
   * intelligently decide when to retrieve and incorporate relevant up-to-date
   * information based on the context of the prompt.
   *
   * @example
   * ```typescript
   * import { bedrock } from '@ai-sdk/amazon-bedrock';
   * import { generateText } from 'ai';
   *
   * const result = await generateText({
   *   model: bedrock('us.amazon.nova-premier-v1:0'),
   *   prompt: 'What are the current AWS Regions and their locations?',
   *   tools: {
   *     nova_grounding: bedrock.tools.nova_grounding(),
   *   },
   * });
   * ```
   */
  nova_grounding: (
    args: Record<string, unknown> = {},
  ): LanguageModelV3ProviderDefinedTool => ({
    type: 'provider-defined' as const,
    id: 'nova.nova_grounding',
    name: 'nova_grounding',
    args,
  }),
};
