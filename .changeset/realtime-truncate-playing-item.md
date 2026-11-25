---
'ai': patch
---

fix(ai): truncate the realtime audio item that is actually playing when the user interrupts

On barge-in, WebSocket realtime sessions sent `conversation-item-truncate` for the most recently received audio item, with an offset measured from when playback started rather than from the start of that item. When a short spoken preamble was queued ahead of the answer (for example before a tool call), interrupting near the end of the answer was rejected by the provider (`Audio content of 12950ms is already shorter than 13957ms`), and other interruptions silently cut the wrong item or at the wrong position. Playback now tracks the item and in-item position of each scheduled audio chunk, including across playback underruns, and truncates that item at the position the user heard.
