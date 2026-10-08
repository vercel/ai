---
'@ai-sdk/harness-pi': patch
---

refactor(harness-pi): drop the workspace mirror and list sandbox skills from settings

The harness no longer copies the sandbox workspace to the host or patches Node's `fs` module to serve that copy at the sandbox path. Pi used the copy only to discover `AGENTS.md`, `CLAUDE.md` and project skills, so Pi no longer reads those files from the sandbox workspace. Native file tools resolve relative paths against the sandbox work directory directly.

Put project context in `instructions` instead. For skills that already exist in the sandbox, the new `resources.skills` setting lists them to the model; each must exist at `filePath`, and the model reads it with the `read` tool, which can read the skill's directory. Pi reads no project settings, context files or skills from the host.

Inline extensions no longer see a host copy of the workspace, including when the sandbox shares the host filesystem. Read project files through `session.sandboxSession`.
