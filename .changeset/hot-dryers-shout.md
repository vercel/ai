---
'@ai-sdk/mistral': minor
'ai': minor
---

Response format was not properly utilized (the depricated mode schema was used in implementations simila to openai. I implemented that Response format is now being passed on to the actual arguments and that it's being used in the Mistral SDK implementation.)
