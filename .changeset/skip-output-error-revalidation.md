---
'ai': patch
---

Skip re-validation of tool input for parts in `output-error` state. The input already failed — re-validating it on subsequent turns permanently bricks the conversation.
