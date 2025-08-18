---
'@ai-sdk/vue': patch
---

Fix UIMessage reactivity issues in Vue by introducing a `deepToRaw` utility and updating `replaceMessage` to ensure message parts arrays update correctly when passed as props to child components.
