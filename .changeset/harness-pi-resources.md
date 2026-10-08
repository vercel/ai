---
'@ai-sdk/harness-pi': patch
---

refactor(harness-pi): drop the workspace mirror and read project resources from settings

The harness no longer copies the sandbox workspace to the host or patches Node's `fs` module to serve that copy at the sandbox path. Pi used the copy only to discover `AGENTS.md`, `CLAUDE.md` and project skills, so Pi no longer reads those files from the sandbox workspace. Native file tools resolve relative paths against the sandbox work directory directly.

The new `resources` setting supplies them instead. `resources.contextFiles` are placed in the system prompt the way Pi places `AGENTS.md`. `resources.skills` are listed to the model and must already exist in the sandbox at `filePath`; the model reads them with the `read` tool, which can read each skill's directory. Pi reads no project settings, context files or skills from the host.

Inline extensions no longer see a host copy of the workspace, including when the sandbox shares the host filesystem. Read project files through `session.sandboxSession`.
