---
'@ai-sdk/google': patch
---

Bound Google JSON Schema conversion work, output size, and depth to prevent excessive resource use when inlining repeated local references. Input inspection and conversion each have a separate budget of 10,000 visited JSON values and a conservative 1,000,000-character serialized-size allowance, with a depth limit of 100. Schemas exceeding these limits now fail with a controlled error, including large schemas that were previously accepted. String-size accounting reserves six characters per UTF-16 code unit for JSON escaping.
