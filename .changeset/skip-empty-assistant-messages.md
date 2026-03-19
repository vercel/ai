---
'ai': patch
---

Skip empty assistant messages in convertToModelMessages when data parts produce no content. Prevents LLM errors from empty role:assistant messages caused by data parts before step-start.
