---
'ai': patch
---

Stop structural UI message validation at the first invalid array element to prevent repeated malformed parts from amplifying validation errors and exhausting memory before agent execution.

Select UI part schemas by type and tool state before validating their fields so malformed metadata cannot multiply errors across unrelated union alternatives.
