---
'@ai-sdk/typesafe-ai': patch
---

Add PNG and JPEG image input support to decision models using multipart uploads, including the required image header and file-level `typesafe.reference` provider options for referencing images in instructions and criteria.

Add the `typesafe.longContext` provider option to enable experimental 262k-token context limits, and add the `jev-1.13.0`, `jev-1.14.0`, and `jev-preview` model IDs alongside `jev-latest`.
