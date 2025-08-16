---
'@ai-sdk/provider': patch
'ai': patch
---

This change introduces telemetry tracing for the `transformParams` function within the `LanguageModelV2Middleware`. A new OpenTelemetry span, named `ai.languageModelMiddleware.transformParams`, is created to wrap the execution of this function. This span records the prompt before and after the transformation, providing clear visibility into how middleware modifies model parameters.

To enable this feature without creating circular package dependencies, the `TelemetrySettings` type definition has been relocated from the `ai` package to `@ai-sdk/provider`.

**BREAKING CHANGE**: The `TelemetrySettings` type is no longer exported from the `ai` package. Consumers of this type should now update their imports to use `@ai-sdk/provider`. Additionally, the `@ai-sdk/provider` package now has a dependency on `@opentelemetry/api`.
