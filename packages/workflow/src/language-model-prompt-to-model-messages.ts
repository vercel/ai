import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import type { ModelMessage } from 'ai';

/**
 * Prepares a workflow-side `LanguageModelV4Prompt` for a second, model-aware
 * `convertToLanguageModelPrompt` pass inside a model step.
 *
 * The workflow-side conversion preserves URLs (it cannot download them) and
 * filters out approval responses for tools that are not provider-executed.
 * The remaining approval responses are restored with the `providerExecuted`
 * marker that the second conversion expects.
 */
export function languageModelPromptToModelMessages(
  prompt: LanguageModelV4Prompt,
): ModelMessage[] {
  return prompt.map(message =>
    message.role !== 'tool'
      ? message
      : {
          ...message,
          content: message.content.map(part =>
            part.type === 'tool-approval-response'
              ? { ...part, providerExecuted: true }
              : part,
          ),
        },
  ) as unknown as ModelMessage[];
}
