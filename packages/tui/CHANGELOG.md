# @ai-sdk/tui

## 1.0.0-canary.11

### Patch Changes

- ai@7.0.0-canary.176

## 1.0.0-canary.10

### Patch Changes

- Updated dependencies [6ec57f5]
  - ai@7.0.0-canary.175

## 1.0.0-canary.9

### Patch Changes

- ai@7.0.0-canary.174

## 1.0.0-canary.8

### Patch Changes

- ai@7.0.0-canary.173

## 1.0.0-canary.7

### Patch Changes

- Updated dependencies [25a64f8]
- Updated dependencies [375fdd7]
- Updated dependencies [f18b08f]
- Updated dependencies [b4507d5]
  - ai@7.0.0-canary.172

## 1.0.0-canary.6

### Patch Changes

- Updated dependencies [89ad56f]
- Updated dependencies [f9a496f]
- Updated dependencies [3295831]
  - ai@7.0.0-canary.171

## 1.0.0-canary.5

### Patch Changes

- Updated dependencies [bae5e2b]
- Updated dependencies [69d7128]
  - ai@7.0.0-canary.170

## 1.0.0-canary.4

### Patch Changes

- Updated dependencies [a5018ab]
- Updated dependencies [21d3d60]
- Updated dependencies [426dbbb]
- Updated dependencies [7fd3360]
  - ai@7.0.0-canary.169

## 1.0.0-canary.3

### Patch Changes

- Updated dependencies [1e4b350]
  - ai@7.0.0-canary.168

## 1.0.0-canary.2

### Patch Changes

- Updated dependencies [4757690]
- Updated dependencies [eeefc3f]
- Updated dependencies [b79b6a8]
  - ai@7.0.0-canary.167

## 1.0.0-canary.1

### Patch Changes

- e757741: feat: agent tui
- Updated dependencies [19736ee]
- Updated dependencies [d66ae02]
- Updated dependencies [e4182bd]
  - ai@7.0.0-canary.166

## 0.4.7

### Patch Changes

- 852b8ac: Use conventional TUI shortcuts for repaint, exit, and page scrolling.

## 0.4.6

### Patch Changes

- 055e2f4: Fix terminal UI agent typing for agents created with separate AI SDK installs.

## 0.4.5

### Patch Changes

- de0e0f0: Update AI SDK compatibility for response performance metadata.

## 0.4.4

### Patch Changes

- dd23c1a: Move `ai` to a peer dependency so consumers use a single AI SDK type instance.

## 0.4.3

### Patch Changes

- 95f9eb8: Show tool-result processing status immediately after tool execution finishes.
- 12db3db: Preserve manual scroll position while new terminal output streams.

## 0.4.2

### Patch Changes

- f0da54f: Show "Processing tool results..." after a tool turn completes and the next step starts.
- f7b47df: Add auto-collapsed terminal display mode for tools and reasoning parts.

## 0.4.1

### Patch Changes

- 6442142: Show tool execution and next-step processing statuses while agent streams continue.

  Allow configuring the context window size so the terminal UI can show token usage as a percentage.

## 0.4.0

### Minor Changes

- 5f0835b: Support interrupting active streams with Ctrl+C, including aborting the underlying agent request and cleaning up the terminal renderer immediately.
- 5f0835b: Surface total token usage in assistant response metadata and show the conversation token count in the terminal UI frame.

### Patch Changes

- 1d48500: Show processing input status until assistant streaming output begins.
