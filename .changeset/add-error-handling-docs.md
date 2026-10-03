---
"ai": patch
---

docs: add comprehensive error handling documentation to agents overview

## What changed

Added a new "Error Handling in Agents" section to the [Agents Overview](/docs/agents/overview) documentation that provides developers with clear guidance on handling errors when building agents with the AI SDK.

## Why this matters

Error handling is a critical aspect of production-ready agent applications. This documentation:

- **Shows code examples** for catching different error types (`APICallError`, `InvalidArgumentError`, `TypeValidationError`, `JSONParseError`, `LoadAPIKeyError`)
- **Explains common error types** and when they occur, including metadata available on each error
- **Demonstrates patterns** for making tools more resilient with proper error handling
- **Covers best practices** including retry logic, fallback strategies, and user-friendly messaging
- **Links to the error source code** in the provider package for deeper dives

## Security and Quality Improvements

- ✅ **Security**: Added guidance on not exposing sensitive information in error messages
- ✅ **Best Practices**: Included comprehensive best practices section with 7 key points
- ✅ **Accuracy**: All error examples use correct imports and API patterns
- ✅ **Metadata**: Documented available properties on each error type (statusCode, url, isRetryable, etc.)
- ✅ **No regressions**: Only documentation changes, no code modifications

## Impact

Developers will now have better guidance on building robust agent applications that can handle failures gracefully. This is especially important for:

- Production deployments where reliability matters
- Tools that make external API calls
- Workflows with multiple steps that need to recover from errors
