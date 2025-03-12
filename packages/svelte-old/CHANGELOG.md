# @ai-sdk/svelte

## 1.1.19

### Patch Changes

- Updated dependencies [ddf9740]
  - @ai-sdk/ui-utils@1.1.16
  - @ai-sdk/provider-utils@2.1.10

## 1.1.18

### Patch Changes

- @ai-sdk/provider-utils@2.1.9
- @ai-sdk/ui-utils@1.1.15

## 1.1.17

### Patch Changes

- 60c3220: fix (ui): set status to ready after stream was aborted

## 1.1.16

### Patch Changes

- c43df41: feat (ui): add useChat status

## 1.1.15

### Patch Changes

- Updated dependencies [2e898b4]
  - @ai-sdk/provider-utils@2.1.8
  - @ai-sdk/ui-utils@1.1.14

## 1.1.14

### Patch Changes

- Updated dependencies [3ff4ef8]
  - @ai-sdk/provider-utils@2.1.7
  - @ai-sdk/ui-utils@1.1.13

## 1.1.13

### Patch Changes

- Updated dependencies [166e09e]
  - @ai-sdk/ui-utils@1.1.12

## 1.1.12

### Patch Changes

- Updated dependencies [318b351]
  - @ai-sdk/ui-utils@1.1.11

## 1.1.11

### Patch Changes

- bcc61d4: feat (ui): introduce message parts for useChat
- Updated dependencies [bcc61d4]
  - @ai-sdk/ui-utils@1.1.10

## 1.1.10

### Patch Changes

- Updated dependencies [6b8cc14]
  - @ai-sdk/ui-utils@1.1.9

## 1.1.9

### Patch Changes

- @ai-sdk/provider-utils@2.1.6
- @ai-sdk/ui-utils@1.1.8

## 1.1.8

### Patch Changes

- 0d2d9bf: fix (ui): empty submits (with allowEmptySubmit) create user messages
- 0d2d9bf: fix (ui): single assistant message with multiple tool steps
- Updated dependencies [0d2d9bf]
  - @ai-sdk/ui-utils@1.1.7

## 1.1.7

### Patch Changes

- 5d7a3b6: feat (ui/svelte): experimental attachment support

## 1.1.6

### Patch Changes

- Updated dependencies [3a602ca]
  - @ai-sdk/provider-utils@2.1.5
  - @ai-sdk/ui-utils@1.1.6

## 1.1.5

### Patch Changes

- Updated dependencies [066206e]
  - @ai-sdk/provider-utils@2.1.4
  - @ai-sdk/ui-utils@1.1.5

## 1.1.4

### Patch Changes

- Updated dependencies [39e5c1f]
  - @ai-sdk/provider-utils@2.1.3
  - @ai-sdk/ui-utils@1.1.4

## 1.1.3

### Patch Changes

- Updated dependencies [9ce598c]
  - @ai-sdk/ui-utils@1.1.3

## 1.1.2

### Patch Changes

- Updated dependencies [ed012d2]
  - @ai-sdk/provider-utils@2.1.2
  - @ai-sdk/ui-utils@1.1.2

## 1.1.1

### Patch Changes

- Updated dependencies [e7a9ec9]
- Updated dependencies [0a699f1]
  - @ai-sdk/ui-utils@1.1.1
  - @ai-sdk/provider-utils@2.1.1

## 1.1.0

### Minor Changes

- 62ba5ad: release: AI SDK 4.1

### Patch Changes

- Updated dependencies [62ba5ad]
  - @ai-sdk/provider-utils@2.1.0
  - @ai-sdk/ui-utils@1.1.0

## 1.0.13

### Patch Changes

- Updated dependencies [33592d2]
  - @ai-sdk/ui-utils@1.0.12

## 1.0.12

### Patch Changes

- Updated dependencies [00114c5]
- Updated dependencies [00114c5]
  - @ai-sdk/provider-utils@2.0.8
  - @ai-sdk/ui-utils@1.0.11

## 1.0.11

### Patch Changes

- 37f4510: feat (ui): expose useChat id and send it to the server
- Updated dependencies [37f4510]
  - @ai-sdk/ui-utils@1.0.10

## 1.0.10

### Patch Changes

- Updated dependencies [2495973]
- Updated dependencies [2495973]
  - @ai-sdk/ui-utils@1.0.9

## 1.0.9

### Patch Changes

- Updated dependencies [90fb95a]
- Updated dependencies [e6dfef4]
- Updated dependencies [6636db6]
  - @ai-sdk/provider-utils@2.0.7
  - @ai-sdk/ui-utils@1.0.8

## 1.0.8

### Patch Changes

- Updated dependencies [19a2ce7]
- Updated dependencies [6337688]
  - @ai-sdk/provider-utils@2.0.6
  - @ai-sdk/ui-utils@1.0.7

## 1.0.7

### Patch Changes

- Updated dependencies [5ed5e45]
  - @ai-sdk/provider-utils@2.0.5
  - @ai-sdk/ui-utils@1.0.6

## 1.0.6

### Patch Changes

- @ai-sdk/provider-utils@2.0.4
- @ai-sdk/ui-utils@1.0.5

## 1.0.5

### Patch Changes

- Updated dependencies [0984f0b]
  - @ai-sdk/provider-utils@2.0.3
  - @ai-sdk/ui-utils@1.0.4

## 1.0.4

### Patch Changes

- Updated dependencies [953469c]
- Updated dependencies [a3dd2ed]
  - @ai-sdk/ui-utils@1.0.3

## 1.0.3

### Patch Changes

- 630ac31: fix (ui): set tool invocation state to "result" when calling addToolResult

## 1.0.2

### Patch Changes

- Updated dependencies [88b364b]
  - @ai-sdk/ui-utils@1.0.2
  - @ai-sdk/provider-utils@2.0.2

## 1.0.1

### Patch Changes

- Updated dependencies [c3ab5de]
  - @ai-sdk/provider-utils@2.0.1
  - @ai-sdk/ui-utils@1.0.1

## 1.0.0

### Major Changes

- e117b54: chore (ui): remove deprecated useChat roundtrip options
- 8bf5756: chore: remove legacy function/tool calling
- 7814c4b: chore (ui): remove streamMode setting from useChat & useCompletion
- fe4f109: chore (ui): set default value of useChat keepLastMessageOnError to true
- 84edae5: chore (release): bump ui package versions for 4.0 release

### Patch Changes

- 79c6dd9: fix (ui): remove unnecessary calls to mutateStreamData in useChat
- 04d3747: chore (ui-utils): restructure processAssistantMessage
- Updated dependencies [8bf5756]
- Updated dependencies [b469a7e]
- Updated dependencies [9f81e66]
- Updated dependencies [70f28f6]
- Updated dependencies [dce4158]
- Updated dependencies [7814c4b]
- Updated dependencies [fe4f109]
- Updated dependencies [b1da952]
- Updated dependencies [04d3747]
- Updated dependencies [dce4158]
- Updated dependencies [7e89ccb]
- Updated dependencies [8426f55]
- Updated dependencies [db46ce5]
- Updated dependencies [b053413]
  - @ai-sdk/ui-utils@1.0.0
  - @ai-sdk/provider-utils@2.0.0

## 1.0.0-canary.9

### Patch Changes

- 79c6dd9: fix (ui): remove unnecessary calls to mutateStreamData in useChat
- 04d3747: chore (ui-utils): restructure processAssistantMessage
- Updated dependencies [04d3747]
  - @ai-sdk/ui-utils@1.0.0-canary.9

## 1.0.0-canary.8

### Patch Changes

- Updated dependencies [b053413]
  - @ai-sdk/ui-utils@1.0.0-canary.8

## 1.0.0-canary.7

### Major Changes

- fe4f109: chore (ui): set default value of useChat keepLastMessageOnError to true

### Patch Changes

- Updated dependencies [fe4f109]
  - @ai-sdk/ui-utils@1.0.0-canary.7

## 1.0.0-canary.6

### Patch Changes

- Updated dependencies [70f28f6]
  - @ai-sdk/ui-utils@1.0.0-canary.6

## 1.0.0-canary.5

### Patch Changes

- Updated dependencies [9f81e66]
- Updated dependencies [8426f55]
  - @ai-sdk/ui-utils@1.0.0-canary.5
  - @ai-sdk/provider-utils@2.0.0-canary.3

## 1.0.0-canary.4

### Patch Changes

- Updated dependencies [dce4158]
- Updated dependencies [dce4158]
  - @ai-sdk/provider-utils@2.0.0-canary.2
  - @ai-sdk/ui-utils@1.0.0-canary.4

## 1.0.0-canary.3

### Patch Changes

- Updated dependencies [b1da952]
  - @ai-sdk/provider-utils@2.0.0-canary.1
  - @ai-sdk/ui-utils@1.0.0-canary.3

## 1.0.0-canary.2

### Major Changes

- e117b54: chore (ui): remove deprecated useChat roundtrip options
- 7814c4b: chore (ui): remove streamMode setting from useChat & useCompletion

### Patch Changes

- Updated dependencies [b469a7e]
- Updated dependencies [7814c4b]
- Updated dependencies [db46ce5]
  - @ai-sdk/provider-utils@2.0.0-canary.0
  - @ai-sdk/ui-utils@1.0.0-canary.2

## 1.0.0-canary.1

### Major Changes

- 8bf5756: chore: remove legacy function/tool calling

### Patch Changes

- Updated dependencies [8bf5756]
  - @ai-sdk/ui-utils@1.0.0-canary.1

## 1.0.0-canary.0

### Major Changes

- 84edae5: chore (release): bump ui package versions for 4.0 release

### Patch Changes

- Updated dependencies [7e89ccb]
  - @ai-sdk/ui-utils@1.0.0-canary.0

## 0.0.57

### Patch Changes

- Updated dependencies [a85c965]
  - @ai-sdk/ui-utils@0.0.50

## 0.0.56

### Patch Changes

- d92fd9f: feat (ui/svelte): support Svelte 5 peer dependency

## 0.0.55

### Patch Changes

- Updated dependencies [3bf8da0]
  - @ai-sdk/ui-utils@0.0.49

## 0.0.54

### Patch Changes

- aa98cdb: chore: more flexible dependency versioning
- Updated dependencies [aa98cdb]
- Updated dependencies [7b937c5]
- Updated dependencies [811a317]
  - @ai-sdk/provider-utils@1.0.22
  - @ai-sdk/ui-utils@0.0.48

## 0.0.53

### Patch Changes

- @ai-sdk/provider-utils@1.0.21
- @ai-sdk/ui-utils@0.0.47

## 0.0.52

### Patch Changes

- caedcda: feat (ai/ui): add setData helper to useChat

## 0.0.51

### Patch Changes

- @ai-sdk/provider-utils@1.0.20
- @ai-sdk/ui-utils@0.0.46

## 0.0.50

### Patch Changes

- Updated dependencies [cd77c5d]
  - @ai-sdk/ui-utils@0.0.45

## 0.0.49

### Patch Changes

- Updated dependencies [273f696]
  - @ai-sdk/provider-utils@1.0.19
  - @ai-sdk/ui-utils@0.0.44

## 0.0.48

### Patch Changes

- Updated dependencies [1f590ef]
  - @ai-sdk/ui-utils@0.0.43

## 0.0.47

### Patch Changes

- Updated dependencies [14210d5]
  - @ai-sdk/ui-utils@0.0.42

## 0.0.46

### Patch Changes

- Updated dependencies [03313cd]
  - @ai-sdk/provider-utils@1.0.18
  - @ai-sdk/ui-utils@0.0.41

## 0.0.45

### Patch Changes

- Updated dependencies [aa2dc58]
  - @ai-sdk/ui-utils@0.0.40

## 0.0.44

### Patch Changes

- @ai-sdk/provider-utils@1.0.17
- @ai-sdk/ui-utils@0.0.39

## 0.0.43

### Patch Changes

- Updated dependencies [d151349]
  - @ai-sdk/ui-utils@0.0.38

## 0.0.42

### Patch Changes

- Updated dependencies [09f895f]
  - @ai-sdk/provider-utils@1.0.16
  - @ai-sdk/ui-utils@0.0.37

## 0.0.41

### Patch Changes

- Updated dependencies [b5a82b7]
  - @ai-sdk/ui-utils@0.0.36

## 0.0.40

### Patch Changes

- Updated dependencies [d67fa9c]
  - @ai-sdk/provider-utils@1.0.15
  - @ai-sdk/ui-utils@0.0.35

## 0.0.39

### Patch Changes

- @ai-sdk/provider-utils@1.0.14
- @ai-sdk/ui-utils@0.0.34

## 0.0.38

### Patch Changes

- @ai-sdk/provider-utils@1.0.13
- @ai-sdk/ui-utils@0.0.33

## 0.0.37

### Patch Changes

- Updated dependencies [dd712ac]
  - @ai-sdk/provider-utils@1.0.12
  - @ai-sdk/ui-utils@0.0.32

## 0.0.36

### Patch Changes

- @ai-sdk/provider-utils@1.0.11
- @ai-sdk/ui-utils@0.0.31

## 0.0.35

### Patch Changes

- Updated dependencies [e9c891d]
- Updated dependencies [4bd27a9]
- Updated dependencies [845754b]
  - @ai-sdk/ui-utils@0.0.30
  - @ai-sdk/provider-utils@1.0.10

## 0.0.34

### Patch Changes

- Updated dependencies [e5b58f3]
  - @ai-sdk/ui-utils@0.0.29

## 0.0.33

### Patch Changes

- @ai-sdk/provider-utils@1.0.9
- @ai-sdk/ui-utils@0.0.28

## 0.0.32

### Patch Changes

- @ai-sdk/provider-utils@1.0.8
- @ai-sdk/ui-utils@0.0.27

## 0.0.31

### Patch Changes

- @ai-sdk/provider-utils@1.0.7
- @ai-sdk/ui-utils@0.0.26

## 0.0.30

### Patch Changes

- Updated dependencies [9614584]
- Updated dependencies [0762a22]
  - @ai-sdk/provider-utils@1.0.6
  - @ai-sdk/ui-utils@0.0.25

## 0.0.29

### Patch Changes

- Updated dependencies [5be25124]
  - @ai-sdk/ui-utils@0.0.24

## 0.0.28

### Patch Changes

- Updated dependencies [fea7b604]
  - @ai-sdk/ui-utils@0.0.23

## 0.0.27

### Patch Changes

- Updated dependencies [1d93d716]
  - @ai-sdk/ui-utils@0.0.22

## 0.0.26

### Patch Changes

- b694f2f9: feat (ai/svelte): add tool calling support to useChat

## 0.0.25

### Patch Changes

- c450fcf7: feat (ui): invoke useChat onFinish with finishReason and tokens
- e4a1719f: chore (ai/ui): rename streamMode to streamProtocol
- Updated dependencies [c450fcf7]
- Updated dependencies [e4a1719f]
  - @ai-sdk/ui-utils@0.0.21

## 0.0.24

### Patch Changes

- b2bee4c5: fix (ai/ui): send data, body, headers in useChat().reload

## 0.0.23

### Patch Changes

- Updated dependencies [a8d1c9e9]
  - @ai-sdk/provider-utils@1.0.5
  - @ai-sdk/ui-utils@0.0.20

## 0.0.22

### Patch Changes

- Updated dependencies [4f88248f]
  - @ai-sdk/provider-utils@1.0.4
  - @ai-sdk/ui-utils@0.0.19

## 0.0.21

### Patch Changes

- @ai-sdk/provider-utils@1.0.3
- @ai-sdk/ui-utils@0.0.18

## 0.0.20

### Patch Changes

- f63829fe: feat (ai/ui): add allowEmptySubmit flag to handleSubmit
- 4b2c09d9: feat (ai/ui): add mutator function support to useChat / setMessages
- Updated dependencies [f63829fe]
  - @ai-sdk/ui-utils@0.0.17

## 0.0.19

### Patch Changes

- Updated dependencies [5b7b3bbe]
  - @ai-sdk/ui-utils@0.0.16

## 0.0.18

### Patch Changes

- Updated dependencies [1f67fe49]
  - @ai-sdk/ui-utils@0.0.15

## 0.0.17

### Patch Changes

- Updated dependencies [99ddbb74]
  - @ai-sdk/ui-utils@0.0.14

## 0.0.16

### Patch Changes

- a6cb2c8b: feat (ai/ui): add keepLastMessageOnError option to useChat
- Updated dependencies [a6cb2c8b]
  - @ai-sdk/ui-utils@0.0.13

## 0.0.15

### Patch Changes

- 56bbc2a7: feat (ai/ui): set body and headers directly on options for handleSubmit and append
- Updated dependencies [56bbc2a7]
  - @ai-sdk/ui-utils@0.0.12

## 0.0.14

### Patch Changes

- @ai-sdk/provider-utils@1.0.2
- @ai-sdk/ui-utils@0.0.11

## 0.0.13

### Patch Changes

- 3db90c3d: allow empty handleSubmit submissions for useChat
- Updated dependencies [d481729f]
  - @ai-sdk/provider-utils@1.0.1
  - @ai-sdk/ui-utils@0.0.10

## 0.0.12

### Patch Changes

- Updated dependencies [1894f811]
  - @ai-sdk/ui-utils@0.0.9

## 0.0.11

### Patch Changes

- d3100b9c: feat (ai/ui): support custom fetch function in useChat, useCompletion, useAssistant, useObject
- Updated dependencies [d3100b9c]
  - @ai-sdk/ui-utils@0.0.8

## 0.0.10

### Patch Changes

- Updated dependencies [5edc6110]
- Updated dependencies [5edc6110]
  - @ai-sdk/provider-utils@1.0.0
  - @ai-sdk/ui-utils@0.0.7

## 0.0.9

### Patch Changes

- 827ef450: feat (ai/ui): improve error handling in useAssistant

## 0.0.8

### Patch Changes

- 82d9c8de: feat (ai/ui): make event in useAssistant submitMessage optional

## 0.0.7

### Patch Changes

- Updated dependencies [54bf4083]
  - @ai-sdk/ui-utils@0.0.6

## 0.0.6

### Patch Changes

- d42b8907: feat (ui): make event in handleSubmit optional

## 0.0.5

### Patch Changes

- Updated dependencies [02f6a088]
  - @ai-sdk/provider-utils@0.0.16
  - @ai-sdk/ui-utils@0.0.5

## 0.0.4

### Patch Changes

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
