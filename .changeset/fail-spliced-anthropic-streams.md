---
'@ai-sdk/anthropic': patch
---

Handle out-of-spec message_start events in the response stream instead of silently corrupting the recorded generation. A duplicated message_start frame for the message that is already open (emitted by some Anthropic-compatible gateways) is now ignored instead of producing a spurious response-metadata part and overwriting usage counters. A message_start for a different message while the previous message is still open (two generations spliced into one stream, e.g. by an intermediary retrying its upstream connection mid-response) now fails the stream with an explicit error; previously both generations' thinking blocks were merged into one recorded step, and Anthropic rejected every subsequent request in the tool loop with "`thinking` or `redacted_thinking` blocks in the latest assistant message cannot be modified". Legitimate message_start/message_stop sequences (programmatic tool calling) are unaffected.
