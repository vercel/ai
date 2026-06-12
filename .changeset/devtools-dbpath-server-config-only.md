---
'@ai-sdk/devtools': patch
---

fix(devtools): determine the viewer database path from server-side config only

The DevTools viewer previously stored a `dbPath` taken from the `/api/notify`
request body and read that file on every API call, letting any page a developer
visited point the viewer at an arbitrary file (arbitrary file read / existence
oracle, plus a synchronous hang/OOM via `/dev/zero` or a huge file). The viewer
now ignores any network-supplied path and reads only from a server-configured
location — the default `<cwd>/.devtools/generations.json`, or the path in the
new `AI_SDK_DEVTOOLS_DB_PATH` env var when the viewer runs in a different
directory than the app. Reads are also bounded to regular files under a size
cap.
