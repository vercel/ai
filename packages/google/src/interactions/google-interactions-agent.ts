/**
 * Type-only module: declares the union of supported Gemini Interactions agent
 * names. Used by the `google.interactions({ agent })` factory branch.
 *
 * Sourced from `googleapis/js-genai` `src/interactions/resources/interactions.ts`
 * (`Interaction.agent` enum). Subject to expansion as Google adds new agents.
 *
 * This is a strict string-literal union (no `string` escape hatch) so that
 * passing an unknown agent name is a compile-time error. Add new agents here
 * as Google publishes them.
 */

export type GoogleInteractionsAgentName =
  | 'deep-research-pro-preview-12-2025'
  | 'deep-research-preview-04-2026'
  | 'deep-research-max-preview-04-2026';
