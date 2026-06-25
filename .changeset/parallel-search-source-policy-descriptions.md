---
'@ai-sdk/gateway': patch
---

Clarify `parallel_search` `source_policy` field descriptions so the model emits
values the Parallel API accepts: `include_domains`/`exclude_domains` must be plain
hosts (no scheme/path/port), and `after_date` must be an ISO 8601 calendar date
formatted `YYYY-MM-DD`.
