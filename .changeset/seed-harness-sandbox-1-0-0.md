---
"@ai-sdk/harness": patch
"@ai-sdk/sandbox-just-bash": patch
"@ai-sdk/sandbox-vercel": patch
---

Start the `1.0.0` canary release line for the experimental harness and sandbox packages. They were unintentionally published as `0.0.0-canary.*` because they were scaffolded with a `0.0.0-canary.0` premajor version, which semver could not advance past on a major bump.
