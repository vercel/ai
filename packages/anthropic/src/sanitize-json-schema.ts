/**
 * Re-exports Anthropic SDK's schema transformer for sanitizing JSON Schema
 * before passing to `output_config.format.schema`.
 *
 * Anthropic's `transformJSONSchema` handles:
 * - Stripping unsupported validation keywords (exclusiveMinimum, pattern, etc.)
 * - Moving stripped keywords into `description` as hints for the model
 * - Converting `oneOf` to `anyOf`
 * - Enforcing `additionalProperties: false` on objects
 * - Allowing only supported string `format` values
 */
export { transformJSONSchema as sanitizeJsonSchema } from '@anthropic-ai/sdk/lib/transform-json-schema';
