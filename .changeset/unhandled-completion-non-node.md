---
"ai": patch
---

fix(ai): attach a no-op rejection handler to the streamText completion promise on non-Node runtimes so aborted/timed-out streams no longer surface an unhandled promise rejection (e.g. "Uncaught (in promise) AbortError" on React Native)
