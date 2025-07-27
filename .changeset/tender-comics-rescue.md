---
'ai': major
---

remove StreamTextResult.mergeIntoDataStream method
rename DataStreamOptions.getErrorMessage to onError
add pipeTextStreamToResponse function
add createTextStreamResponse function
change createDataStreamResponse function to accept a DataStream and not a DataStreamWriter
change pipeDataStreamToResponse function to accept a DataStream and not a DataStreamWriter
change pipeDataStreamToResponse function to have a single parameter
