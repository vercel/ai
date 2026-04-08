---
'@ai-sdk/openai': patch
---

Add support for `number[]` in file_search filter values for `in` and `nin` operators.

This change extends the allowed types for the file_search filter `value` field to include `number[]`, enabling numeric set-based metadata filtering (e.g., filtering documents where 'year' is in [2022, 2023, 2024]).

Previously, the SDK only supported `string | number | boolean | string[]` for filter values, which caused validation errors when using numeric arrays with the `in` or `nin` operators despite the OpenAI API supporting this use case.
