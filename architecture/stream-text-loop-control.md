```
initial model messages
response model messages
stitchable stream

do {
  prepare step
  convert step input messages (after prepare step) to language model v4 messages

 stream = doStream (with language model v4 messages)

 transform function for user friendly format

 run tools transformation on stream
   executes tools and injects tool results into stream
   tool approval?

 pipe stream with tool results through further transforms
   transforms:
     add start-step
     filter out empty text chunks
     tool input start
     filter raw chunks when not enabled
     add finish-step
     add finish
   bookkeeping:
     keep track of tool calls/outputs/errors
   timeout mgmt
   events:
     telemetry, tool input delta

 add transformed stream with minor augmentation to stitchable stream

 add new response model messages
   by converting the assembled step output
   to additional response model messages

} while (
    not (
        any of the stop conditions is met
        or
        finish reason is not tool-calls
        or
        tool without execute is called
        or
        tool that needs approval is called
        or
        there are deferred tool calls
    )
)

unified stream
stream 1 -- stream 2 -- stream 3
```
