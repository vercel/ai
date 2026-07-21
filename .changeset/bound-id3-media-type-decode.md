---
'@ai-sdk/provider-utils': patch
---

fix(provider-utils): bound media-type sniffing decode for ID3-prefixed input

Media-type detection stripped ID3 tags before the ~18-byte prefix cap, decoding the entire base64 attachment (plus a full-size copy) whenever the data began with `ID3`/`SUQz`. This turned the intended O(1) sniff into an O(N) decode of the whole attachment. Detection now decodes at most a bounded prefix and skips the ID3 tag within that bound, keeping cost O(1) in input size on all paths (image, audio, and combined).
