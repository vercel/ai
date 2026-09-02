---
'ai': patch
---

fix(ai): throw a descriptive error when a tool is missing an input schema

A tool defined without `inputSchema` (for example one still using the AI SDK 4
`parameters` key) was serialized with an empty input schema, so the invalid tool
definition only surfaced as a provider error such as Vertex AI's
"functionDeclaration parameters schema should be of type OBJECT". Such tools now
fail with an `InvalidArgumentError` that names the tool and the expected
property.
