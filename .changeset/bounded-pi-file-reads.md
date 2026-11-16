---
'@ai-sdk/harness-pi-v2': patch
---

The Pi adapter's read, edit and image-detection operations read a file only with bounded windows inside the sandbox, so a file that grows or is replaced between its stat and its read cannot make the host process hold more than the 10 MiB limit, and a read that the sandbox cannot run is reported instead of loading the whole file. The `find` tool stops its enumeration at 50,000 paths and 4 MiB in the sandbox, and the `ls` tool lists at most 10,000 entries and 2 MiB, so a tree or a directory that sandbox code filled cannot fill the memory of the host before the result limit applies.
