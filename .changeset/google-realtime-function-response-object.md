---
'@ai-sdk/google': patch
---

fix(google): keep a realtime `functionResponse.response` an object

Gemini types that field as a `google.protobuf.Struct`, which accepts an object and
nothing else. `onToolCall` returns `unknown` and `addToolOutput` takes `unknown`, so a
string, number, array or `null` tool result reached the wire unwrapped, Gemini closed
the socket with `1007`, and the close code was dropped on the way back so the
application saw a plain disconnect. A non-object result is now wrapped under the
`output` key the field's own docstring prescribes; an object is passed through
unchanged, as before.

An `output` that is not valid JSON no longer becomes `{}`. That branch told the model
the tool had returned an empty object, with nothing thrown and the socket still up, so
the answer was wrong with nothing to notice. The text is kept instead.
