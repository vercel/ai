export interface DeferredToolDefinition {
  /**
   * Unique name of the tool — user-visible.
   */
  name: string;

  /**
   * Natural-language description of what the tool does.
   * Used by BM25 + regex ranking.
   */
  description: string;

  /**
   * The JSON schema used for the tool's input.
   */
  inputSchema: any;

  /**
   * Optional hints to improve ranking.
   */
  keywords?: string[];

  /**
   * Internal metadata (extensible).
   */
  metadata?: Record<string, any>;
}

export interface RankedToolResult {
  tool: DeferredToolDefinition;
  score: number;
}
