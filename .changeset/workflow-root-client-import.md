---
'@ai-sdk/workflow': patch
---

fix(workflow): recommend importing `WorkflowChatTransport` from the `@ai-sdk/workflow` root in client code again, now that `workflow` ships a browser build (`@ai-sdk/workflow/client` remains available). The `workflow` peer dependency minimum is raised to the first release with the browser build (TODO: set the version once vercel/workflow#5335 is released).
