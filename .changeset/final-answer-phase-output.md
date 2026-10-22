---
'ai': patch
---

fix(ai): parse only the last `final_answer` message for structured output when a reply carries phase metadata (e.g. OpenAI Responses commentary plus final_answer messages), instead of failing on the concatenated JSON documents.
