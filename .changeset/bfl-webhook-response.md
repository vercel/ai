---
'@ai-sdk/black-forest-labs': patch
---

fix: poll get_result when a webhook submit response has no polling URL

Setting `webhookUrl` makes Black Forest Labs return a webhook-shaped submit
response without `polling_url`, which caused `generateImage` to fail response
validation. The submit schema now accepts that response shape, and generation
polls the `get_result` endpoint by request id so the call still returns the
image. Transient `Task not found` responses are retried for a short grace
period; a task that never becomes visible now fails with an error naming the
request id instead of a generic poll timeout.
