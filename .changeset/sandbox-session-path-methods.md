---
'@ai-sdk/provider-utils': patch
'ai': patch
'@ai-sdk/sandbox-just-bash': patch
'@ai-sdk/sandbox-vercel': patch
'@ai-sdk/harness-pi': patch
'@ai-sdk/workflow': patch
---

feat(sandbox): add `stat`, `listDirectory`, and `deleteFile` to `Experimental_SandboxSession`, and specify that relative paths in every method resolve against the directory `run` and `spawn` start in

The just-bash and Vercel Sandbox adapters implement the new methods. Both now resolve a relative `workingDirectory` for `run` and `spawn` against the sandbox's working directory, and the just-bash adapter rejects writes to a directory instead of replacing it with a file.
