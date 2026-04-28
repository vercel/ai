/**
 * A mapping of provider names to provider-specific file identifiers.
 *
 * Provider references allow files to be identified across different
 * providers without re-uploading, by storing each provider's own
 * identifier for the same logical file.
 *
 * ```ts
 * {
 *   "openai": "file-abc123",
 *   "anthropic": "file-xyz789"
 * }
 * ```
 */
export type SharedV4ProviderReference = Record<string, string>;
