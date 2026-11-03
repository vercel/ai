---
'@ai-sdk/provider': patch
'@ai-sdk/openai': patch
'@ai-sdk/azure': patch
'@ai-sdk/amazon-bedrock': patch
'ai': patch
'@ai-sdk/otel': patch
---

Report the actual OpenAI Chat HTTP endpoint (also used by Azure Chat and Bedrock Mantle Chat) through optional request metadata and model-call end events. Record its host and port on OpenTelemetry chat spans without exposing URL credentials, paths, queries, or fragments. Expose only the sanitized HTTP origin in text and object generation results and step/finish callbacks. Providers that do not report an endpoint leave these attributes unset.
