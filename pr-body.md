## Description

This PR adds comprehensive error handling documentation to the Agents Overview page, helping developers build more robust agent applications.

## Changes

- Added a new "Error Handling in Agents" section to the [Agents Overview](/docs/agents/overview) documentation
- Documented common error types including `AISDKError`, `APICallError`, and others
- Provided code examples for catching different error types
- Showed patterns for making tools more resilient with proper error handling
- Linked to the full error reference documentation

## Why This Matters

Error handling is critical for production-ready agent applications. This documentation:
- Shows developers how to catch and handle different error types
- Explains when errors occur and how to prevent them
- Provides practical patterns for building resilient tools

## Impact

Developers will now have better guidance on:
- Building robust agent applications that handle failures gracefully
- Making tools more resilient with proper error handling
- Production deployments where reliability matters

This is especially important for:
- Tools that make external API calls
- Workflows with multiple steps that need to recover from errors
