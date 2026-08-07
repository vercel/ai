---
'@ai-sdk/provider': patch
'ai': patch
---

feat(video): allow `aspectRatio: 'adaptive'` on `generateVideo`

Some video models derive the output ratio from the input and reject explicit
`{width}:{height}` values — BytePlus Seedance 2.5 does this for first-frame,
first-and-last-frame, editing, and extension tasks. `aspectRatio` on
`VideoModelV3CallOptions`, and
`experimental_generateVideo` is now `` `${number}:${number}` | 'adaptive' ``, so
those calls no longer need a type assertion. Support is provider-specific.
