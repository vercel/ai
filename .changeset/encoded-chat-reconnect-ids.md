---
'ai': patch
---

Encode chat IDs in default stream reconnection URLs so slashes, query delimiters, and fragments stay within the ID. Reject standalone `.` and `..` IDs before fetching. Custom URLs returned by `prepareReconnectToStreamRequest` remain unchanged.
