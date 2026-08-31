---
'@ai-sdk/tui': patch
---

fix(tui): strip terminal escape sequences from untrusted text

The terminal UI only stripped CSI sequences (`ESC [ … final`) when measuring and
slicing lines, so every other escape sequence in model output, reasoning, tool
inputs and results, error messages, tool names and pasted input was written to
the terminal verbatim. That let a model or a poisoned tool result silently drive
the user's terminal: OSC 52 wrote the system clipboard (arming the next paste
into their shell), OSC 0/2 rewrote the window title, OSC 8 disguised a hyperlink
target, DCS/APC reached a terminal multiplexer, and unterminated sequences
swallowed the rest of the frame. CSI sequences were preserved rather than
dropped, so cursor movement could also rewrite output the user had already read
and `CSI 6n` could make the terminal report state back on stdin.

Untrusted text is now sanitized before it is rendered: CSI, OSC, DCS, SOS, PM
and APC sequences (including their 8-bit C1 forms and unterminated variants) and
control characters are removed, newlines in single-line chrome are collapsed to
spaces, and the line slicer keeps only the SGR styling the terminal UI itself
emits.
