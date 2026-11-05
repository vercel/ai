---
'ai': patch
---

ai: support non-base64 data URLs in file parts. Data URLs without the ';base64' marker (RFC 2397, e.g. inline SVG, text, or CSV) are now percent-decoded instead of being misread as base64, which previously caused InvalidCharacterError crashes or silently sent the wrong bytes to providers.
