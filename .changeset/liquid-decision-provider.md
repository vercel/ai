---
'@ai-sdk/liquid': patch
---

Add a first-party Liquid provider for the experimental decision API. Support
Choice, Score, and Boolean questions with d1 and text-only d1:free, and move
images from state.images into Liquid's native top-level images array without
mutating the caller's state. Expose Liquid's reported cost in provider metadata.
