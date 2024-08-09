# @ai-sdk/react

## 0.0.41

### Patch Changes

- e5b58f3: fix (ai/ui): forward streaming errors in useChat
- Updated dependencies [e5b58f3]
  - @ai-sdk/ui-utils@0.0.29

## 0.0.40

### Patch Changes

- @ai-sdk/provider-utils@1.0.9
- @ai-sdk/ui-utils@0.0.28

## 0.0.39

### Patch Changes

- @ai-sdk/provider-utils@1.0.8
- @ai-sdk/ui-utils@0.0.27

## 0.0.38

### Patch Changes

- @ai-sdk/provider-utils@1.0.7
- @ai-sdk/ui-utils@0.0.26

## 0.0.37

### Patch Changes

- Updated dependencies [9614584]
- Updated dependencies [0762a22]
  - @ai-sdk/provider-utils@1.0.6
  - @ai-sdk/ui-utils@0.0.25

## 0.0.36

### Patch Changes

- 5be25124: fix (ai/ui): useChat messages have stable ids with streamProtocol: "text"
- Updated dependencies [5be25124]
  - @ai-sdk/ui-utils@0.0.24

## 0.0.35

### Patch Changes

- a147d040: feat (ai/react): useObject clears object when loading new result

## 0.0.34

### Patch Changes

- b68fae4f: feat (ai/ui): add onFinish callback to useObject

## 0.0.33

### Patch Changes

- Updated dependencies [fea7b604]
  - @ai-sdk/ui-utils@0.0.23

## 0.0.32

### Patch Changes

- Updated dependencies [1d93d716]
  - @ai-sdk/ui-utils@0.0.22

## 0.0.31

### Patch Changes

- c450fcf7: feat (ui): invoke useChat onFinish with finishReason and tokens
- e4a1719f: chore (ai/ui): rename streamMode to streamProtocol
- Updated dependencies [c450fcf7]
- Updated dependencies [e4a1719f]
  - @ai-sdk/ui-utils@0.0.21

## 0.0.30

### Patch Changes

- b2bee4c5: fix (ai/ui): send data, body, headers in useChat().reload

## 0.0.29

### Patch Changes

- Updated dependencies [a8d1c9e9]
  - @ai-sdk/provider-utils@1.0.5
  - @ai-sdk/ui-utils@0.0.20

## 0.0.28

### Patch Changes

- Updated dependencies [4f88248f]
  - @ai-sdk/provider-utils@1.0.4
  - @ai-sdk/ui-utils@0.0.19

## 0.0.27

### Patch Changes

- @ai-sdk/provider-utils@1.0.3
- @ai-sdk/ui-utils@0.0.18

## 0.0.26

### Patch Changes

- f63829fe: feat (ai/ui): add allowEmptySubmit flag to handleSubmit
- 4b2c09d9: feat (ai/ui): add mutator function support to useChat / setMessages
- Updated dependencies [f63829fe]
  - @ai-sdk/ui-utils@0.0.17

## 0.0.25

### Patch Changes

- 5b7b3bbe: fix (ai/ui): tool call streaming
- Updated dependencies [5b7b3bbe]
  - @ai-sdk/ui-utils@0.0.16

## 0.0.24

### Patch Changes

- 19c3d50f: fix (ai/ui): add missing createdAt

## 0.0.23

### Patch Changes

- Updated dependencies [1f67fe49]
  - @ai-sdk/ui-utils@0.0.15

## 0.0.22

### Patch Changes

- 99ddbb74: feat (ai/react): add experimental support for managing attachments to useChat
- Updated dependencies [99ddbb74]
  - @ai-sdk/ui-utils@0.0.14

## 0.0.21

### Patch Changes

- a6cb2c8b: feat (ai/ui): add keepLastMessageOnError option to useChat
- Updated dependencies [a6cb2c8b]
  - @ai-sdk/ui-utils@0.0.13

## 0.0.20

### Patch Changes

- 56bbc2a7: feat (ai/ui): set body and headers directly on options for handleSubmit and append
- Updated dependencies [56bbc2a7]
  - @ai-sdk/ui-utils@0.0.12

## 0.0.19

### Patch Changes

- @ai-sdk/provider-utils@1.0.2
- @ai-sdk/ui-utils@0.0.11

## 0.0.18

### Patch Changes

- 70d18003: add setThreadId helper to switch between threads for useAssistant

## 0.0.17

### Patch Changes

- 6a11cfaa: feat (ai/ui): add onError handler to useObject
- 3db90c3d: allow empty handleSubmit submissions for useChat
- Updated dependencies [d481729f]
  - @ai-sdk/provider-utils@1.0.1
  - @ai-sdk/ui-utils@0.0.10

## 0.0.16

### Patch Changes

- 3f756a6b: fix (ai/react): include fetch parameter as part of useChat

## 0.0.15

### Patch Changes

- 6c99581e: fix (ai/react): stop() on useObject does not throw error and clears isLoading

## 0.0.14

### Patch Changes

- 9b50003d: fix (ai/react): useObject stop & isLoading reset at end of stream
- 1894f811: feat (ai/ui): allow JSONValue as data in useChat handleSubmit
- Updated dependencies [1894f811]
  - @ai-sdk/ui-utils@0.0.9

## 0.0.13

### Patch Changes

- d3100b9c: feat (ai/ui): support custom fetch function in useChat, useCompletion, useAssistant, useObject
- Updated dependencies [d3100b9c]
  - @ai-sdk/ui-utils@0.0.8

## 0.0.12

### Patch Changes

- Updated dependencies [5edc6110]
- Updated dependencies [5edc6110]
  - @ai-sdk/provider-utils@1.0.0
  - @ai-sdk/ui-utils@0.0.7

## 0.0.11

### Patch Changes

- 827ef450: feat (ai/ui): improve error handling in useAssistant

## 0.0.10

### Patch Changes

- 5b04204b: chore (ai/react): rename useChat setInput to submit
- 8f482903: feat (ai/react): add stop() helper to useObject

## 0.0.9

### Patch Changes

- 321a7d0e: feat (ai/react): add isLoading to useObject

## 0.0.8

### Patch Changes

- 54bf4083: feat (ai/react): control request body in useChat
- Updated dependencies [54bf4083]
  - @ai-sdk/ui-utils@0.0.6

## 0.0.7

### Patch Changes

- d42b8907: feat (ui): make event in handleSubmit optional

## 0.0.6

### Patch Changes

- 3cb103bc: fix (ai/react): prevent infinite tool call loop

## 0.0.5

### Patch Changes

- Updated dependencies [02f6a088]
  - @ai-sdk/provider-utils@0.0.16
  - @ai-sdk/ui-utils@0.0.5

## 0.0.4

### Patch Changes

- 008725ec: feat (@ai-sdk/react): add experimental_useObject to @ai-sdk/react
- Updated dependencies [008725ec]
  - @ai-sdk/ui-utils@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies [85712895]
- Updated dependencies [85712895]
  - @ai-sdk/provider-utils@0.0.15
  - @ai-sdk/ui-utils@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [7910ae84]
  - @ai-sdk/provider-utils@0.0.14
  - @ai-sdk/ui-utils@0.0.2

## 0.0.1

### Patch Changes

- 85f209a4: chore: extracted ui library support into separate modules
- Updated dependencies [85f209a4]
  - @ai-sdk/ui-utils@0.0.1
