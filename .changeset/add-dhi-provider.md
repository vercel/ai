---
'@ai-sdk/dhi': major
---

Add @ai-sdk/dhi package for dhi and Zod 4 schema support.

This package provides a `dhiSchema()` function that supports both:

- **dhi schemas** - uses dhi's built-in `toJsonSchema()` method
- **Zod 4 schemas** - uses zod's `toJSONSchema` function

dhi is a high-performance validation library with Zod 4 API compatibility, offering 7-18x faster validation than Zod.

Both peer dependencies are optional - users can choose either library.
