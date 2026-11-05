---
'@ai-sdk/typesafe-ai': patch
'@ai-sdk/provider': patch
---

Fix TypeSafe decision requests with primitive JSON state by serializing those values as text, reject empty criteria and null or undefined Score levels before sending a request, and expose structured Score legends in provider metadata. Allow omitted or null Box instructions and null Boolean criteria in experimental decision question types.
