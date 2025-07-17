# Zod and AI SDK

## Background

The AI SDK allows users to use Zod 3, Zod 4, and Zod 4 mini schemas directly.

Incorrect internal implementations can lead to infinite recursion and OOM issues such as [#7351](https://github.com/vercel/ai/issues/7351).

## Rules

- always use `z.core.$ZodType`
- always use `import * as z from 'zod/v4/core'`

## Future Work

- set up linter to ensure imports are correct

## Related issues

- [OOM bug report](https://github.com/vercel/ai/issues/7351)

## References

- [Zod library authors guide](https://zod.dev/library-authors)
