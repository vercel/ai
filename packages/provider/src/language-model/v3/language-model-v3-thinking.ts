/**
 * Top-level reasoning / thinking configuration for language model calls.
 */
export type LanguageModelV3Thinking =
  | {
      /**
       * Disable thinking / reasoning for providers that support it.
       */
      type: 'disabled';
    }
  | {
      /**
       * Enable thinking / reasoning for providers that support it.
       */
      type: 'enabled';

      /**
       * Relative effort level for providers that support effort-based thinking controls.
       */
      effort?: 'low' | 'medium' | 'high';

      /**
       * Token budget for providers that support budget-based thinking controls.
       */
      budgetTokens?: number;
    };
