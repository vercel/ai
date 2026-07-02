---
"ai": patch
---

fix(ui): guard activeResponse access in makeRequest finally block to prevent "Cannot read properties of undefined (reading 'state')" error when calling sendMessage() after addToolOutput()
