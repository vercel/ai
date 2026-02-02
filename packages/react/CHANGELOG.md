# @ai-sdk/react

## 3.0.70

### Patch Changes

- Updated dependencies [8bf2660]
  - ai@6.0.68

## 3.0.69

### Patch Changes

- Updated dependencies [53f6731]
  - ai@6.0.67
  - @ai-sdk/provider-utils@4.0.13

## 3.0.68

### Patch Changes

- Updated dependencies [96936e5]
  - @ai-sdk/provider-utils@4.0.12
  - ai@6.0.66

## 3.0.67

### Patch Changes

- ai@6.0.65

## 3.0.66

### Patch Changes

- Updated dependencies [ce9daa3]
  - ai@6.0.64

## 3.0.65

### Patch Changes

- Updated dependencies [be95579]
  - ai@6.0.63

## 3.0.64

### Patch Changes

- Updated dependencies [2810850]
  - @ai-sdk/provider-utils@4.0.11
  - ai@6.0.62

## 3.0.63

### Patch Changes

- ai@6.0.61

## 3.0.62

### Patch Changes

- Updated dependencies [5fc42fa]
  - ai@6.0.60

## 3.0.61

### Patch Changes

- ai@6.0.59

## 3.0.60

### Patch Changes

- ai@6.0.58

## 3.0.59

### Patch Changes

- Updated dependencies [65865d8]
  - ai@6.0.57

## 3.0.58

### Patch Changes

- ai@6.0.56

## 3.0.57

### Patch Changes

- Updated dependencies [43a74df]
  - ai@6.0.55

## 3.0.56

### Patch Changes

- Updated dependencies [2f8ac87]
  - ai@6.0.54

## 3.0.55

### Patch Changes

- Updated dependencies [7ee3f10]
  - ai@6.0.53

## 3.0.54

### Patch Changes

- Updated dependencies [462ad00]
  - @ai-sdk/provider-utils@4.0.10
  - ai@6.0.52

## 3.0.53

### Patch Changes

- Updated dependencies [ea0feb5]
  - ai@6.0.51

## 3.0.52

### Patch Changes

- ai@6.0.50

## 3.0.51

### Patch Changes

- Updated dependencies [ded661b]
  - ai@6.0.49

## 3.0.50

### Patch Changes

- 4de5a1d: chore: excluded tests from src folder in npm package
- Updated dependencies [4de5a1d]
  - ai@6.0.48
  - @ai-sdk/provider-utils@4.0.9

## 3.0.49

### Patch Changes

- ai@6.0.47

## 3.0.48

### Patch Changes

- 8dc54db: chore: add src folders to package bundle
  - ai@6.0.46

## 3.0.47

### Patch Changes

- ai@6.0.45

## 3.0.46

### Patch Changes

- ai@6.0.44

## 3.0.45

### Patch Changes

- Updated dependencies [2dc9bfa]
  - ai@6.0.43

## 3.0.44

### Patch Changes

- ai@6.0.42

## 3.0.43

### Patch Changes

- Updated dependencies [84b6e6d]
  - ai@6.0.41

## 3.0.42

### Patch Changes

- Updated dependencies [ab57783]
  - ai@6.0.40

## 3.0.41

### Patch Changes

- Updated dependencies [4e28ba0]
  - ai@6.0.39

## 3.0.40

### Patch Changes

- ai@6.0.38
- @ai-sdk/provider-utils@4.0.8

## 3.0.39

### Patch Changes

- Updated dependencies [b5dab9b]
  - ai@6.0.37

## 3.0.38

### Patch Changes

- Updated dependencies [46f46e4]
  - @ai-sdk/provider-utils@4.0.7
  - ai@6.0.36

## 3.0.37

### Patch Changes

- Updated dependencies [d7e7f1f]
  - ai@6.0.35

## 3.0.36

### Patch Changes

- Updated dependencies [1b11dcb]
  - ai@6.0.34
  - @ai-sdk/provider-utils@4.0.6

## 3.0.35

### Patch Changes

- Updated dependencies [0ca078c]
  - ai@6.0.33

## 3.0.34

### Patch Changes

- Updated dependencies [ec24401]
  - ai@6.0.32

## 3.0.33

### Patch Changes

- ai@6.0.31

## 3.0.32

### Patch Changes

- Updated dependencies [34d1c8a]
  - @ai-sdk/provider-utils@4.0.5
  - ai@6.0.30

## 3.0.31

### Patch Changes

- Updated dependencies [fdce123]
  - ai@6.0.29

## 3.0.30

### Patch Changes

- Updated dependencies [d4486d2]
  - ai@6.0.28

## 3.0.29

### Patch Changes

- ai@6.0.27

## 3.0.28

### Patch Changes

- 3219eab: feat(react): support async/function headers in useObject

  The `useObject` hook now accepts headers as an async function, enabling dynamic header generation (e.g., fetching auth tokens) without causing the hook to re-render.

  This provides parity with `useChat` and resolves issues with infinite loops when using state-based headers with `useEffect`.

## 3.0.27

### Patch Changes

- Updated dependencies [40d4997]
  - ai@6.0.26

## 3.0.26

### Patch Changes

- Updated dependencies [b64f256]
  - ai@6.0.25

## 3.0.25

### Patch Changes

- Updated dependencies [4f236c8]
  - ai@6.0.24

## 3.0.24

### Patch Changes

- 000a0a6: Fix: ensure `useChat` uses the latest `onToolCall` (and other callbacks) to avoid stale closures.

  Changes:

  - Update `useChat` to use intermediary proxy callbacks that forward to refs, ensuring the latest callbacks are always used without recreating the chat instance.
  - Add a regression test verifying the latest `onToolCall` is invoked after a prop change.

  Related to: https://github.com/vercel/ai/issues/8148

## 3.0.23

### Patch Changes

- Updated dependencies [a4c680a]
- Updated dependencies [8c6f067]
  - ai@6.0.23

## 3.0.22

### Patch Changes

- Updated dependencies [f0d29de]
  - ai@6.0.22

## 3.0.21

### Patch Changes

- Updated dependencies [9667780]
  - ai@6.0.21

## 3.0.20

### Patch Changes

- Updated dependencies [f748c46]
  - ai@6.0.20

## 3.0.19

### Patch Changes

- ai@6.0.19

## 3.0.18

### Patch Changes

- Updated dependencies [d6ec0e2]
  - ai@6.0.18

## 3.0.17

### Patch Changes

- Updated dependencies [af0955e]
  - ai@6.0.17

## 3.0.16

### Patch Changes

- Updated dependencies [81adf59]
  - ai@6.0.16

## 3.0.15

### Patch Changes

- Updated dependencies [3a73fb3]
  - ai@6.0.15

## 3.0.14

### Patch Changes

- Updated dependencies [3f9453f]
  - ai@6.0.14

## 3.0.13

### Patch Changes

- Updated dependencies [e2c445d]
  - ai@6.0.13

## 3.0.12

### Patch Changes

- Updated dependencies [d937c8f]
  - ai@6.0.12
  - @ai-sdk/provider-utils@4.0.4

## 3.0.11

### Patch Changes

- ai@6.0.11

## 3.0.10

### Patch Changes

- Updated dependencies [ae26f95]
  - ai@6.0.10

## 3.0.9

### Patch Changes

- Updated dependencies [4e90233]
  - ai@6.0.9

## 3.0.8

### Patch Changes

- Updated dependencies [0b429d4]
  - @ai-sdk/provider-utils@4.0.3
  - ai@6.0.8

## 3.0.7

### Patch Changes

- ai@6.0.7

## 3.0.6

### Patch Changes

- ai@6.0.6

## 3.0.5

### Patch Changes

- 863d34f: fix: trigger release to update `@latest`
- Updated dependencies [863d34f]
  - ai@6.0.5
  - @ai-sdk/provider-utils@4.0.2

## 3.0.4

### Patch Changes

- ai@6.0.4

## 3.0.3

### Patch Changes

- Updated dependencies [29264a3]
  - @ai-sdk/provider-utils@4.0.1
  - ai@6.0.3

## 3.0.2

### Patch Changes

- Updated dependencies [129ff26]
  - ai@6.0.2

## 3.0.1

### Patch Changes

- ai@6.0.1

## 3.0.0

### Major Changes

- dee8b05: ai SDK 6 beta

### Minor Changes

- 78928cb: release: start 5.1 beta

### Patch Changes

- 4b3b981: Fix subscribeToMessages callback dependency in useChat
- ab1087b: feat(ai): `chat.addToolResult()` is now `chat.addToolOutput()`
- c388279: force update of vulnerable react versions through peer dependency range
- 95f65c2: chore: use import \* from zod/v4
- e8109d3: feat: tool execution approval
- f6f0c5a: chore: remove zod from ui packages
- af65ab6: drop react 19-rc support. Require minimal versions for RSC to address CVE-2025-55182
- 4616b86: chore: update zod peer depenedency version
- a322efa: Added finishReason on useChat onFinish callbck
- 10c1322: fix: moved dependency `@ai-sdk/test-server` to devDependencies
- Updated dependencies
  - ai@6.0.0
  - @ai-sdk/provider-utils@4.0.0

## 3.0.0-beta.172

### Patch Changes

- Updated dependencies [ee651d7]
  - ai@6.0.0-beta.169

## 3.0.0-beta.171

### Patch Changes

- ai@6.0.0-beta.168

## 3.0.0-beta.170

### Patch Changes

- Updated dependencies [475189e]
  - ai@6.0.0-beta.167
  - @ai-sdk/provider-utils@4.0.0-beta.59

## 3.0.0-beta.169

### Patch Changes

- Updated dependencies [9f20c87]
  - ai@6.0.0-beta.166

## 3.0.0-beta.168

### Patch Changes

- Updated dependencies [2625a04]
  - ai@6.0.0-beta.165
  - @ai-sdk/provider-utils@4.0.0-beta.58

## 3.0.0-beta.167

### Patch Changes

- Updated dependencies [cbf52cd]
  - ai@6.0.0-beta.164
  - @ai-sdk/provider-utils@4.0.0-beta.57

## 3.0.0-beta.166

### Patch Changes

- ai@6.0.0-beta.163
- @ai-sdk/provider-utils@4.0.0-beta.56

## 3.0.0-beta.165

### Patch Changes

- Updated dependencies [50b70d6]
  - @ai-sdk/provider-utils@4.0.0-beta.55
  - ai@6.0.0-beta.162

## 3.0.0-beta.164

### Patch Changes

- ai@6.0.0-beta.161

## 3.0.0-beta.163

### Patch Changes

- Updated dependencies [9061dc0]
  - @ai-sdk/provider-utils@4.0.0-beta.54
  - ai@6.0.0-beta.160

## 3.0.0-beta.162

### Patch Changes

- Updated dependencies [3071620]
  - ai@6.0.0-beta.159

## 3.0.0-beta.161

### Patch Changes

- ai@6.0.0-beta.158
- @ai-sdk/provider-utils@4.0.0-beta.53

## 3.0.0-beta.160

### Patch Changes

- Updated dependencies [763d04a]
  - @ai-sdk/provider-utils@4.0.0-beta.52
  - ai@6.0.0-beta.157

## 3.0.0-beta.159

### Patch Changes

- Updated dependencies [2406576]
  - ai@6.0.0-beta.156

## 3.0.0-beta.158

### Patch Changes

- Updated dependencies [c1efac4]
  - @ai-sdk/provider-utils@4.0.0-beta.51
  - ai@6.0.0-beta.155

## 3.0.0-beta.157

### Patch Changes

- Updated dependencies [32223c8]
  - @ai-sdk/provider-utils@4.0.0-beta.50
  - ai@6.0.0-beta.154

## 3.0.0-beta.156

### Patch Changes

- Updated dependencies [83e5744]
  - @ai-sdk/provider-utils@4.0.0-beta.49
  - ai@6.0.0-beta.153

## 3.0.0-beta.155

### Patch Changes

- Updated dependencies [960ec8f]
  - @ai-sdk/provider-utils@4.0.0-beta.48
  - ai@6.0.0-beta.152

## 3.0.0-beta.154

### Patch Changes

- Updated dependencies [dcdac8c]
  - ai@6.0.0-beta.151

## 3.0.0-beta.153

### Patch Changes

- Updated dependencies [db62f7d]
  - ai@6.0.0-beta.150

## 3.0.0-beta.152

### Patch Changes

- Updated dependencies [4e2b04d]
  - ai@6.0.0-beta.149

## 3.0.0-beta.151

### Patch Changes

- ai@6.0.0-beta.148

## 3.0.0-beta.150

### Patch Changes

- Updated dependencies [637eaa4]
  - ai@6.0.0-beta.147

## 3.0.0-beta.149

### Patch Changes

- Updated dependencies [e9e157f]
  - @ai-sdk/provider-utils@4.0.0-beta.47
  - ai@6.0.0-beta.146

## 3.0.0-beta.148

### Patch Changes

- ai@6.0.0-beta.145

## 3.0.0-beta.147

### Patch Changes

- Updated dependencies [ab6f01a]
  - ai@6.0.0-beta.144

## 3.0.0-beta.146

### Patch Changes

- c388279: force update of vulnerable react versions through peer dependency range

## 3.0.0-beta.145

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@4.0.0-beta.46
  - ai@6.0.0-beta.143

## 3.0.0-beta.144

### Patch Changes

- Updated dependencies
  - ai@6.0.0-beta.142

## 3.0.0-beta.143

### Patch Changes

- Updated dependencies [b1405bf]
  - ai@6.0.0-beta.141

## 3.0.0-beta.142

### Patch Changes

- Updated dependencies [7fdd89d]
  - ai@6.0.0-beta.140

## 3.0.0-beta.141

### Patch Changes

- Updated dependencies [3bd2689]
  - ai@6.0.0-beta.139
  - @ai-sdk/provider-utils@4.0.0-beta.45

## 3.0.0-beta.140

### Patch Changes

- ai@6.0.0-beta.138
- @ai-sdk/provider-utils@4.0.0-beta.44

## 3.0.0-beta.139

### Patch Changes

- 4b3b981: Fix subscribeToMessages callback dependency in useChat

## 3.0.0-beta.138

### Patch Changes

- Updated dependencies [9ba4324]
  - ai@6.0.0-beta.137

## 3.0.0-beta.137

### Patch Changes

- Updated dependencies [3d83f38]
  - ai@6.0.0-beta.136

## 3.0.0-beta.136

### Patch Changes

- Updated dependencies [afe7093]
  - ai@6.0.0-beta.135

## 3.0.0-beta.135

### Patch Changes

- Updated dependencies [686103c]
  - ai@6.0.0-beta.134

## 3.0.0-beta.134

### Patch Changes

- Updated dependencies [dce03c4]
  - @ai-sdk/provider-utils@4.0.0-beta.43
  - ai@6.0.0-beta.133

## 3.0.0-beta.133

### Patch Changes

- Updated dependencies [af9dab3]
  - ai@6.0.0-beta.132

## 3.0.0-beta.132

### Patch Changes

- Updated dependencies [3ed5519]
  - @ai-sdk/provider-utils@4.0.0-beta.42
  - ai@6.0.0-beta.131

## 3.0.0-beta.131

### Patch Changes

- af65ab6: drop react 19-rc support. Require minimal versions for RSC to address CVE-2025-55182

## 3.0.0-beta.130

### Patch Changes

- Updated dependencies [1bd7d32]
  - @ai-sdk/provider-utils@4.0.0-beta.41
  - ai@6.0.0-beta.130

## 3.0.0-beta.129

### Patch Changes

- Updated dependencies [67a407c]
  - ai@6.0.0-beta.129

## 3.0.0-beta.128

### Patch Changes

- ai@6.0.0-beta.128

## 3.0.0-beta.127

### Patch Changes

- Updated dependencies [614599a]
  - ai@6.0.0-beta.127

## 3.0.0-beta.126

### Patch Changes

- Updated dependencies [b67d224]
  - ai@6.0.0-beta.126

## 3.0.0-beta.125

### Patch Changes

- Updated dependencies [0d6c0d8]
  - ai@6.0.0-beta.125

## 3.0.0-beta.124

### Patch Changes

- Updated dependencies [544d4e8]
  - @ai-sdk/provider-utils@4.0.0-beta.40
  - ai@6.0.0-beta.124

## 3.0.0-beta.123

### Patch Changes

- Updated dependencies [954c356]
  - @ai-sdk/provider-utils@4.0.0-beta.39
  - ai@6.0.0-beta.123

## 3.0.0-beta.122

### Patch Changes

- Updated dependencies [03849b0]
  - @ai-sdk/provider-utils@4.0.0-beta.38
  - ai@6.0.0-beta.122

## 3.0.0-beta.121

### Patch Changes

- ai@6.0.0-beta.121

## 3.0.0-beta.120

### Patch Changes

- Updated dependencies [457318b]
  - ai@6.0.0-beta.120
  - @ai-sdk/provider-utils@4.0.0-beta.37

## 3.0.0-beta.119

### Patch Changes

- Updated dependencies [b59d924]
  - ai@6.0.0-beta.119

## 3.0.0-beta.118

### Patch Changes

- Updated dependencies [8d9e8ad]
  - ai@6.0.0-beta.118
  - @ai-sdk/provider-utils@4.0.0-beta.36

## 3.0.0-beta.117

### Patch Changes

- ai@6.0.0-beta.117
- @ai-sdk/provider-utils@4.0.0-beta.35

## 3.0.0-beta.116

### Patch Changes

- Updated dependencies [4ece5f9]
  - ai@6.0.0-beta.116

## 3.0.0-beta.115

### Patch Changes

- Updated dependencies [7da02d2]
  - ai@6.0.0-beta.115

## 3.0.0-beta.114

### Patch Changes

- Updated dependencies [69768c2]
  - ai@6.0.0-beta.114

## 3.0.0-beta.113

### Patch Changes

- Updated dependencies [79a8e7f]
  - ai@6.0.0-beta.113

## 3.0.0-beta.112

### Patch Changes

- Updated dependencies [e06b663]
  - ai@6.0.0-beta.112

## 3.0.0-beta.111

### Patch Changes

- ai@6.0.0-beta.111

## 3.0.0-beta.110

### Patch Changes

- Updated dependencies [db913bd]
  - ai@6.0.0-beta.110
  - @ai-sdk/provider-utils@4.0.0-beta.34

## 3.0.0-beta.109

### Patch Changes

- Updated dependencies [79ba99f]
  - ai@6.0.0-beta.109

## 3.0.0-beta.108

### Patch Changes

- ai@6.0.0-beta.108

## 3.0.0-beta.107

### Patch Changes

- Updated dependencies [8445d70]
  - ai@6.0.0-beta.107

## 3.0.0-beta.106

### Patch Changes

- ai@6.0.0-beta.106

## 3.0.0-beta.105

### Patch Changes

- ai@6.0.0-beta.105

## 3.0.0-beta.104

### Patch Changes

- Updated dependencies [2d166e4]
  - ai@6.0.0-beta.104

## 3.0.0-beta.103

### Patch Changes

- ai@6.0.0-beta.103

## 3.0.0-beta.102

### Patch Changes

- ai@6.0.0-beta.102

## 3.0.0-beta.101

### Patch Changes

- ai@6.0.0-beta.101

## 3.0.0-beta.100

### Patch Changes

- Updated dependencies [8370068]
  - ai@6.0.0-beta.100

## 3.0.0-beta.99

### Patch Changes

- Updated dependencies [384142c]
  - ai@6.0.0-beta.99

## 3.0.0-beta.98

### Patch Changes

- Updated dependencies [b681d7d]
  - ai@6.0.0-beta.98
  - @ai-sdk/provider-utils@4.0.0-beta.33

## 3.0.0-beta.97

### Patch Changes

- Updated dependencies [32d8dbb]
  - @ai-sdk/provider-utils@4.0.0-beta.32
  - ai@6.0.0-beta.97

## 3.0.0-beta.96

### Patch Changes

- a322efa: Added finishReason on useChat onFinish callbck
- Updated dependencies [a322efa]
  - ai@6.0.0-beta.96

## 3.0.0-beta.95

### Patch Changes

- Updated dependencies [eb8d1cb]
  - ai@6.0.0-beta.95

## 3.0.0-beta.94

### Patch Changes

- ab1087b: feat(ai): `chat.addToolResult()` is now `chat.addToolOutput()`
- Updated dependencies [ab1087b]
  - ai@6.0.0-beta.94

## 3.0.0-beta.93

### Patch Changes

- ai@6.0.0-beta.93
- @ai-sdk/provider-utils@4.0.0-beta.31

## 3.0.0-beta.92

### Patch Changes

- Updated dependencies [97b1d77]
  - ai@6.0.0-beta.92

## 3.0.0-beta.91

### Patch Changes

- Updated dependencies [4f16c37]
  - @ai-sdk/provider-utils@4.0.0-beta.30
  - ai@6.0.0-beta.91

## 3.0.0-beta.90

### Patch Changes

- ai@6.0.0-beta.90
- @ai-sdk/provider-utils@4.0.0-beta.29

## 3.0.0-beta.89

### Patch Changes

- Updated dependencies [d59ce25]
  - ai@6.0.0-beta.89

## 3.0.0-beta.88

### Patch Changes

- Updated dependencies [22ef5c6]
  - ai@6.0.0-beta.88

## 3.0.0-beta.87

### Patch Changes

- Updated dependencies [ca13d26]
  - ai@6.0.0-beta.87

## 3.0.0-beta.86

### Patch Changes

- Updated dependencies [36b175c]
  - ai@6.0.0-beta.86

## 3.0.0-beta.85

### Patch Changes

- ai@6.0.0-beta.85

## 3.0.0-beta.84

### Patch Changes

- Updated dependencies [016b111]
  - @ai-sdk/provider-utils@4.0.0-beta.28
  - ai@6.0.0-beta.84

## 3.0.0-beta.83

### Patch Changes

- Updated dependencies [e1f6e8e]
  - ai@6.0.0-beta.83

## 3.0.0-beta.82

### Patch Changes

- Updated dependencies [37c58a0]
  - ai@6.0.0-beta.82
  - @ai-sdk/provider-utils@4.0.0-beta.27

## 3.0.0-beta.81

### Patch Changes

- ai@6.0.0-beta.81

## 3.0.0-beta.80

### Patch Changes

- Updated dependencies [9524761]
  - ai@6.0.0-beta.80

## 3.0.0-beta.79

### Patch Changes

- Updated dependencies [d1bdadb]
  - ai@6.0.0-beta.79
  - @ai-sdk/provider-utils@4.0.0-beta.26

## 3.0.0-beta.78

### Patch Changes

- ai@6.0.0-beta.78
- @ai-sdk/provider-utils@4.0.0-beta.25

## 3.0.0-beta.77

### Patch Changes

- Updated dependencies [0c3b58b]
  - ai@6.0.0-beta.77
  - @ai-sdk/provider-utils@4.0.0-beta.24

## 3.0.0-beta.76

### Patch Changes

- Updated dependencies [a755db5]
  - ai@6.0.0-beta.76
  - @ai-sdk/provider-utils@4.0.0-beta.23

## 3.0.0-beta.75

### Patch Changes

- Updated dependencies
  - ai@6.0.0-beta.75
  - @ai-sdk/provider-utils@4.0.0-beta.22

## 3.0.0-beta.74

### Patch Changes

- Updated dependencies [293a6b7]
  - @ai-sdk/provider-utils@4.0.0-beta.21
  - ai@6.0.0-beta.74

## 3.0.0-beta.73

### Patch Changes

- Updated dependencies [754df61]
  - ai@6.0.0-beta.73

## 3.0.0-beta.72

### Patch Changes

- Updated dependencies [eca63f3]
  - ai@6.0.0-beta.72

## 3.0.0-beta.71

### Patch Changes

- Updated dependencies [077aea3]
  - ai@6.0.0-beta.71

## 3.0.0-beta.70

### Patch Changes

- Updated dependencies [d7bae86]
  - ai@6.0.0-beta.70

## 3.0.0-beta.69

### Patch Changes

- Updated dependencies [d5b25ee]
  - ai@6.0.0-beta.69

## 3.0.0-beta.68

### Patch Changes

- Updated dependencies [9b83947]
  - ai@6.0.0-beta.68

## 3.0.0-beta.67

### Patch Changes

- ai@6.0.0-beta.67

## 3.0.0-beta.66

### Patch Changes

- Updated dependencies
  - ai@6.0.0-beta.66
  - @ai-sdk/provider-utils@4.0.0-beta.20

## 3.0.0-beta.65

### Patch Changes

- Updated dependencies [dce4e7b]
  - ai@6.0.0-beta.65

## 3.0.0-beta.64

### Patch Changes

- Updated dependencies [2d28066]
  - ai@6.0.0-beta.64

## 3.0.0-beta.63

### Patch Changes

- Updated dependencies [a7da2b6]
  - ai@6.0.0-beta.63

## 3.0.0-beta.62

### Patch Changes

- Updated dependencies [95b77e2]
  - ai@6.0.0-beta.62

## 3.0.0-beta.61

### Patch Changes

- Updated dependencies [c98373a]
  - ai@6.0.0-beta.61

## 3.0.0-beta.60

### Patch Changes

- Updated dependencies [2b49dae]
  - ai@6.0.0-beta.60

## 3.0.0-beta.59

### Patch Changes

- Updated dependencies [e062079]
  - ai@6.0.0-beta.59

## 3.0.0-beta.58

### Patch Changes

- Updated dependencies [a417a34]
  - ai@6.0.0-beta.58

## 3.0.0-beta.57

### Patch Changes

- Updated dependencies [61f7b0f]
  - ai@6.0.0-beta.57

## 3.0.0-beta.56

### Patch Changes

- Updated dependencies [3794514]
  - @ai-sdk/provider-utils@4.0.0-beta.19
  - ai@6.0.0-beta.56

## 3.0.0-beta.55

### Patch Changes

- Updated dependencies [42cf7ed]
  - ai@6.0.0-beta.55

## 3.0.0-beta.54

### Patch Changes

- Updated dependencies [9388ff1]
  - ai@6.0.0-beta.54

## 3.0.0-beta.53

### Patch Changes

- ai@6.0.0-beta.53

## 3.0.0-beta.52

### Patch Changes

- ai@6.0.0-beta.52

## 3.0.0-beta.51

### Patch Changes

- Updated dependencies [5e313e3]
  - ai@6.0.0-beta.51

## 3.0.0-beta.50

### Patch Changes

- Updated dependencies
  - ai@6.0.0-beta.50
  - @ai-sdk/provider-utils@4.0.0-beta.18

## 3.0.0-beta.49

### Patch Changes

- Updated dependencies [703459a]
  - @ai-sdk/provider-utils@4.0.0-beta.17
  - ai@6.0.0-beta.49

## 3.0.0-beta.48

### Patch Changes

- Updated dependencies [7f2c9b6]
  - ai@6.0.0-beta.48

## 3.0.0-beta.47

### Patch Changes

- Updated dependencies [c62ecf0]
  - ai@6.0.0-beta.47

## 3.0.0-beta.46

### Patch Changes

- ai@6.0.0-beta.46

## 3.0.0-beta.45

### Patch Changes

- Updated dependencies [48454ab]
  - ai@6.0.0-beta.45

## 3.0.0-beta.44

### Patch Changes

- Updated dependencies [2b1bf9d]
  - ai@6.0.0-beta.44

## 3.0.0-beta.43

### Patch Changes

- Updated dependencies [27e8c3a]
  - ai@6.0.0-beta.43

## 3.0.0-beta.42

### Patch Changes

- Updated dependencies [6306603]
  - @ai-sdk/provider-utils@4.0.0-beta.16
  - ai@6.0.0-beta.42

## 3.0.0-beta.41

### Patch Changes

- Updated dependencies [f0b2157]
  - @ai-sdk/provider-utils@4.0.0-beta.15
  - ai@6.0.0-beta.41

## 3.0.0-beta.40

### Patch Changes

- Updated dependencies [3b1d015]
  - @ai-sdk/provider-utils@4.0.0-beta.14
  - ai@6.0.0-beta.40

## 3.0.0-beta.39

### Patch Changes

- f6f0c5a: chore: remove zod from ui packages
- Updated dependencies [f6f0c5a]
  - ai@6.0.0-beta.39

## 3.0.0-beta.38

### Patch Changes

- Updated dependencies [d116b4b]
  - @ai-sdk/provider-utils@4.0.0-beta.13
  - ai@6.0.0-beta.38

## 3.0.0-beta.37

### Patch Changes

- Updated dependencies [7e32fea]
  - @ai-sdk/provider-utils@4.0.0-beta.12
  - ai@6.0.0-beta.37

## 3.0.0-beta.36

### Patch Changes

- ai@6.0.0-beta.36

## 3.0.0-beta.35

### Patch Changes

- ai@6.0.0-beta.35

## 3.0.0-beta.34

### Patch Changes

- Updated dependencies [bb10a89]
  - ai@6.0.0-beta.34

## 3.0.0-beta.33

### Patch Changes

- Updated dependencies [f733285]
  - ai@6.0.0-beta.33

## 3.0.0-beta.32

### Patch Changes

- Updated dependencies [7e4649f]
  - ai@6.0.0-beta.32

## 3.0.0-beta.31

### Patch Changes

- 95f65c2: chore: use import \* from zod/v4
- Updated dependencies
  - @ai-sdk/provider-utils@4.0.0-beta.11
  - ai@6.0.0-beta.31

## 3.0.0-beta.30

### Patch Changes

- ai@6.0.0-beta.30

## 3.0.0-beta.29

### Major Changes

- dee8b05: ai SDK 6 beta

### Patch Changes

- Updated dependencies [dee8b05]
  - ai@6.0.0-beta.29
  - @ai-sdk/provider-utils@4.0.0-beta.10

## 2.1.0-beta.28

### Patch Changes

- Updated dependencies [521c537]
  - @ai-sdk/provider-utils@3.1.0-beta.9
  - ai@5.1.0-beta.28

## 2.1.0-beta.27

### Patch Changes

- Updated dependencies [e06565c]
  - @ai-sdk/provider-utils@3.1.0-beta.8
  - ai@5.1.0-beta.27

## 2.1.0-beta.26

### Patch Changes

- Updated dependencies [c99da05]
  - ai@5.1.0-beta.26

## 2.1.0-beta.25

### Patch Changes

- Updated dependencies [457f1c6]
  - ai@5.1.0-beta.25

## 2.1.0-beta.24

### Patch Changes

- Updated dependencies [90e5bdd]
  - ai@5.1.0-beta.24

## 2.1.0-beta.23

### Patch Changes

- ai@5.1.0-beta.23

## 2.1.0-beta.22

### Patch Changes

- e8109d3: feat: tool execution approval
- Updated dependencies
  - ai@5.1.0-beta.22
  - @ai-sdk/provider-utils@3.1.0-beta.7

## 2.1.0-beta.21

### Patch Changes

- ai@5.1.0-beta.21

## 2.1.0-beta.20

### Patch Changes

- Updated dependencies [846e80e]
  - ai@5.1.0-beta.20

## 2.1.0-beta.19

### Patch Changes

- Updated dependencies
  - ai@5.1.0-beta.19

## 2.1.0-beta.18

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.1.0-beta.6
  - ai@5.1.0-beta.18

## 2.1.0-beta.17

### Patch Changes

- ai@5.1.0-beta.17

## 2.1.0-beta.16

### Patch Changes

- Updated dependencies [14ca35d]
  - ai@5.1.0-beta.16

## 2.1.0-beta.15

### Patch Changes

- ai@5.1.0-beta.15

## 2.1.0-beta.14

### Patch Changes

- 10c1322: fix: moved dependency `@ai-sdk/test-server` to devDependencies
- Updated dependencies
  - ai@5.1.0-beta.14
  - @ai-sdk/provider-utils@3.1.0-beta.5

## 2.1.0-beta.13

### Patch Changes

- Updated dependencies [1c2a4c1]
  - ai@5.1.0-beta.13

## 2.1.0-beta.12

### Patch Changes

- ai@5.1.0-beta.12

## 2.1.0-beta.11

### Patch Changes

- 4616b86: chore: update zod peer depenedency version
- Updated dependencies [4616b86]
  - @ai-sdk/provider-utils@3.1.0-beta.4
  - ai@5.1.0-beta.11

## 2.1.0-beta.10

### Patch Changes

- Updated dependencies [8c98371]
  - ai@5.1.0-beta.10

## 2.1.0-beta.9

### Patch Changes

- Updated dependencies
  - ai@5.1.0-beta.9
  - @ai-sdk/provider-utils@3.1.0-beta.3

## 2.1.0-beta.8

### Patch Changes

- Updated dependencies [7eca093]
  - ai@5.1.0-beta.8

## 2.1.0-beta.7

### Patch Changes

- Updated dependencies [5a4e732]
  - ai@5.1.0-beta.7

## 2.1.0-beta.6

### Patch Changes

- Updated dependencies [0c4822d]
  - ai@5.1.0-beta.6
  - @ai-sdk/provider-utils@3.1.0-beta.2

## 2.1.0-beta.5

### Patch Changes

- ai@5.1.0-beta.5

## 2.1.0-beta.4

### Patch Changes

- ai@5.1.0-beta.4

## 2.1.0-beta.3

### Patch Changes

- ai@5.1.0-beta.3

## 2.1.0-beta.2

### Patch Changes

- Updated dependencies
  - @ai-sdk/test-server@1.0.0-beta.0
  - @ai-sdk/provider-utils@3.1.0-beta.1
  - ai@5.1.0-beta.2

## 2.1.0-beta.1

### Patch Changes

- Updated dependencies [a7f6f81]
  - ai@5.1.0-beta.1

## 2.1.0-beta.0

### Minor Changes

- 78928cb: release: start 5.1 beta

### Patch Changes

- Updated dependencies [78928cb]
  - ai@5.1.0-beta.0
  - @ai-sdk/provider-utils@3.1.0-beta.0

## 2.0.45

### Patch Changes

- Updated dependencies
  - ai@5.0.45

## 2.0.44

### Patch Changes

- ai@5.0.44

## 2.0.43

### Patch Changes

- Updated dependencies [0294b58]
  - @ai-sdk/provider-utils@3.0.9
  - ai@5.0.43

## 2.0.42

### Patch Changes

- Updated dependencies [de5c066]
  - ai@5.0.42

## 2.0.41

### Patch Changes

- Updated dependencies [cd91e4b]
  - ai@5.0.41

## 2.0.40

### Patch Changes

- ai@5.0.40

## 2.0.39

### Patch Changes

- Updated dependencies [a0a725f]
  - ai@5.0.39

## 2.0.38

### Patch Changes

- ai@5.0.38

## 2.0.37

### Patch Changes

- Updated dependencies [d6785d7]
  - ai@5.0.37

## 2.0.36

### Patch Changes

- Updated dependencies [ccc2ded]
  - ai@5.0.36

## 2.0.35

### Patch Changes

- Updated dependencies [99c946a]
  - ai@5.0.35

## 2.0.34

### Patch Changes

- ai@5.0.34

## 2.0.33

### Patch Changes

- ai@5.0.33

## 2.0.32

### Patch Changes

- ai@5.0.32

## 2.0.31

### Patch Changes

- Updated dependencies [99964ed]
  - @ai-sdk/provider-utils@3.0.8
  - ai@5.0.31

## 2.0.30

### Patch Changes

- Updated dependencies [7fcc6be]
  - ai@5.0.30

## 2.0.29

### Patch Changes

- Updated dependencies [e0e9449]
  - ai@5.0.29

## 2.0.28

### Patch Changes

- Updated dependencies
  - ai@5.0.28

## 2.0.27

### Patch Changes

- Updated dependencies [ca40fac]
  - ai@5.0.27

## 2.0.26

### Patch Changes

- Updated dependencies [33cf848]
  - ai@5.0.26

## 2.0.25

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.7
  - ai@5.0.25

## 2.0.24

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.6
  - ai@5.0.24

## 2.0.23

### Patch Changes

- Updated dependencies
  - ai@5.0.23

## 2.0.22

### Patch Changes

- ai@5.0.22

## 2.0.21

### Patch Changes

- Updated dependencies
  - ai@5.0.21
  - @ai-sdk/provider-utils@3.0.5

## 2.0.20

### Patch Changes

- Updated dependencies [8a87693]
  - ai@5.0.20

## 2.0.19

### Patch Changes

- Updated dependencies [8da6e9c]
  - ai@5.0.19

## 2.0.18

### Patch Changes

- ai@5.0.18

## 2.0.17

### Patch Changes

- Updated dependencies
  - ai@5.0.17

## 2.0.16

### Patch Changes

- Updated dependencies [68751f9]
  - @ai-sdk/provider-utils@3.0.4
  - ai@5.0.16

## 2.0.15

### Patch Changes

- Updated dependencies [ca4f68f]
  - ai@5.0.15

## 2.0.14

### Patch Changes

- Updated dependencies [7729e32]
  - ai@5.0.14

## 2.0.13

### Patch Changes

- Updated dependencies
  - ai@5.0.13

## 2.0.12

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.3
  - ai@5.0.12

## 2.0.11

### Patch Changes

- Updated dependencies
  - ai@5.0.11
  - @ai-sdk/provider-utils@3.0.2

## 2.0.10

### Patch Changes

- Updated dependencies [63a5dc5]
  - ai@5.0.10

## 2.0.9

### Patch Changes

- Updated dependencies [afd5c2a]
  - ai@5.0.9

## 2.0.8

### Patch Changes

- ai@5.0.8

## 2.0.7

### Patch Changes

- Updated dependencies [8e72304]
  - ai@5.0.7

## 2.0.6

### Patch Changes

- Updated dependencies [d983eee]
  - ai@5.0.6

## 2.0.5

### Patch Changes

- ai@5.0.5

## 2.0.4

### Patch Changes

- ai@5.0.4

## 2.0.3

### Patch Changes

- Updated dependencies [90d212f]
  - @ai-sdk/provider-utils@3.0.1
  - ai@5.0.3

## 2.0.2

### Patch Changes

- Updated dependencies
  - ai@5.0.2

## 2.0.1

### Patch Changes

- Updated dependencies [4d0c108]
  - ai@5.0.1

## 2.0.0

### Major Changes

- 0a710d8: feat (ui): typed tool parts in ui messages
- d5f588f: AI SDK 5
- 496bbc1: chore (ui): inline/remove ChatRequest type
- 40acf9b: feat (ui): introduce ChatStore and ChatTransport
- 98f25e5: chore (ui): remove managed chat inputs
- 9477ebb: chore (ui): remove useAssistant hook (**breaking change**)
- 901df02: feat (ui): use UI_MESSAGE generic

### Patch Changes

- d1410bb: fix (ai/react): chat instance recreation in useChat
- 376a7d1: fix message subscription out of sync when chat id changes after mount
- 6a0ff37: fix (react): integrate addToolResult into UseChatHelpers type without intersection
- c34ccd7: feat (ui/react): support resuming an ongoing stream
- 995baa0: fix (react): structuredClone message in replaceMessage
- 6b14724: chore (ai/react): add experimental throttle back to useChat
- ac34802: Add clear object function to React and Angular packages
- d1a034f: feature: using Zod 4 for internal stuff
- ae0dc0a: feat (ui/react): add resume flag to useChat
- b34c1c0: fix(react): stabilize setMessages in useChat
- 205077b: fix: improve Zod compatibility
- f2c7f19: feat (ui): add Chat.clearError()
- Updated dependencies
  - ai@5.0.0
  - @ai-sdk/provider-utils@3.0.0

## 2.0.0-beta.34

### Patch Changes

- f2c7f19: feat (ui): add Chat.clearError()
- Updated dependencies
  - ai@5.0.0-beta.34
  - @ai-sdk/provider-utils@3.0.0-beta.10

## 2.0.0-beta.33

### Patch Changes

- Updated dependencies
  - ai@5.0.0-beta.33
  - @ai-sdk/provider-utils@3.0.0-beta.9

## 2.0.0-beta.32

### Patch Changes

- Updated dependencies
  - ai@5.0.0-beta.32

## 2.0.0-beta.31

### Patch Changes

- Updated dependencies
  - ai@5.0.0-beta.31
  - @ai-sdk/provider-utils@3.0.0-beta.8

## 2.0.0-beta.30

### Patch Changes

- ai@5.0.0-beta.30

## 2.0.0-beta.29

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-beta.7
  - ai@5.0.0-beta.29

## 2.0.0-beta.28

### Patch Changes

- ac34802: Add clear object function to React and Angular packages
- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-beta.6
  - ai@5.0.0-beta.28

## 2.0.0-beta.27

### Patch Changes

- Updated dependencies [d5ae088]
  - ai@5.0.0-beta.27

## 2.0.0-beta.26

### Patch Changes

- Updated dependencies
  - ai@5.0.0-beta.26

## 2.0.0-beta.25

### Patch Changes

- ai@5.0.0-beta.25

## 2.0.0-beta.24

### Patch Changes

- 376a7d1: fix message subscription out of sync when chat id changes after mount
- Updated dependencies
  - ai@5.0.0-beta.24
  - @ai-sdk/provider-utils@3.0.0-beta.5

## 2.0.0-beta.23

### Patch Changes

- Updated dependencies [89ba235]
  - ai@5.0.0-beta.23

## 2.0.0-beta.22

### Patch Changes

- 205077b: fix: improve Zod compatibility
- Updated dependencies
  - ai@5.0.0-beta.22
  - @ai-sdk/provider-utils@3.0.0-beta.4

## 2.0.0-beta.21

### Patch Changes

- Updated dependencies
  - ai@5.0.0-beta.21

## 2.0.0-beta.20

### Patch Changes

- Updated dependencies [4c8f834]
  - ai@5.0.0-beta.20

## 2.0.0-beta.19

### Patch Changes

- Updated dependencies
  - ai@5.0.0-beta.19
  - @ai-sdk/provider-utils@3.0.0-beta.3

## 2.0.0-beta.18

### Patch Changes

- b34c1c0: fix(react): stabilize setMessages in useChat
- Updated dependencies
  - ai@5.0.0-beta.18

## 2.0.0-beta.17

### Patch Changes

- ai@5.0.0-beta.17

## 2.0.0-beta.16

### Patch Changes

- ai@5.0.0-beta.16

## 2.0.0-beta.15

### Patch Changes

- Updated dependencies [8e31d46]
  - ai@5.0.0-beta.15

## 2.0.0-beta.14

### Patch Changes

- ai@5.0.0-beta.14

## 2.0.0-beta.13

### Patch Changes

- d1410bb: fix (ai/react): chat instance recreation in useChat
- Updated dependencies
  - ai@5.0.0-beta.13

## 2.0.0-beta.12

### Patch Changes

- Updated dependencies
  - ai@5.0.0-beta.12

## 2.0.0-beta.11

### Patch Changes

- Updated dependencies [9e40cbe]
  - ai@5.0.0-beta.11

## 2.0.0-beta.10

### Patch Changes

- Updated dependencies
  - ai@5.0.0-beta.10

## 2.0.0-beta.9

### Patch Changes

- Updated dependencies [86cfc72]
  - ai@5.0.0-beta.9

## 2.0.0-beta.8

### Patch Changes

- Updated dependencies
  - ai@5.0.0-beta.8

## 2.0.0-beta.7

### Patch Changes

- Updated dependencies [60132dd]
  - ai@5.0.0-beta.7

## 2.0.0-beta.6

### Patch Changes

- Updated dependencies
  - ai@5.0.0-beta.6

## 2.0.0-beta.5

### Patch Changes

- Updated dependencies [4f3e637]
  - ai@5.0.0-beta.5

## 2.0.0-beta.4

### Patch Changes

- Updated dependencies [09f41ac]
  - ai@5.0.0-beta.4

## 2.0.0-beta.3

### Patch Changes

- ai@5.0.0-beta.3

## 2.0.0-beta.2

### Patch Changes

- d1a034f: feature: using Zod 4 for internal stuff
- Updated dependencies
  - ai@5.0.0-beta.2
  - @ai-sdk/provider-utils@3.0.0-beta.2

## 2.0.0-beta.1

### Patch Changes

- Updated dependencies
  - ai@5.0.0-beta.1
  - @ai-sdk/provider-utils@3.0.0-beta.1

## 2.0.0-alpha.15

### Patch Changes

- ae0dc0a: feat (ui/react): add resume flag to useChat
- Updated dependencies
  - ai@5.0.0-alpha.15
  - @ai-sdk/provider-utils@3.0.0-alpha.15

## 2.0.0-alpha.14

### Patch Changes

- 995baa0: fix (react): structuredClone message in replaceMessage
- Updated dependencies [63f9e9b]
  - ai@5.0.0-alpha.14
  - @ai-sdk/provider-utils@3.0.0-alpha.14

## 2.0.0-alpha.13

### Major Changes

- 0a710d8: feat (ui): typed tool parts in ui messages
- 901df02: feat (ui): use UI_MESSAGE generic

### Patch Changes

- Updated dependencies
  - ai@5.0.0-alpha.13
  - @ai-sdk/provider-utils@3.0.0-alpha.13

## 2.0.0-alpha.12

### Patch Changes

- Updated dependencies
  - ai@5.0.0-alpha.12
  - @ai-sdk/provider-utils@3.0.0-alpha.12

## 2.0.0-alpha.11

### Patch Changes

- Updated dependencies [e8324c5]
  - ai@5.0.0-alpha.11
  - @ai-sdk/provider-utils@3.0.0-alpha.11

## 2.0.0-alpha.10

### Major Changes

- 98f25e5: chore (ui): remove managed chat inputs

### Patch Changes

- Updated dependencies
  - ai@5.0.0-alpha.10
  - @ai-sdk/provider-utils@3.0.0-alpha.10

## 2.0.0-alpha.9

### Patch Changes

- Updated dependencies
  - ai@5.0.0-alpha.9
  - @ai-sdk/provider-utils@3.0.0-alpha.9

## 2.0.0-alpha.8

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-alpha.8
  - ai@5.0.0-alpha.8

## 2.0.0-alpha.7

### Patch Changes

- Updated dependencies
  - ai@5.0.0-alpha.7
  - @ai-sdk/provider-utils@3.0.0-alpha.7

## 2.0.0-alpha.6

### Patch Changes

- Updated dependencies
  - ai@5.0.0-alpha.6
  - @ai-sdk/provider-utils@3.0.0-alpha.6

## 2.0.0-alpha.5

### Patch Changes

- Updated dependencies
  - ai@5.0.0-alpha.5

## 2.0.0-alpha.4

### Patch Changes

- 6b14724: chore (ai/react): add experimental throttle back to useChat
- Updated dependencies
  - ai@5.0.0-alpha.4
  - @ai-sdk/provider-utils@3.0.0-alpha.4

## 2.0.0-alpha.3

### Patch Changes

- Updated dependencies
  - ai@5.0.0-alpha.3
  - @ai-sdk/provider-utils@3.0.0-alpha.3

## 2.0.0-alpha.2

### Patch Changes

- Updated dependencies [82aa95d]
  - ai@5.0.0-alpha.2
  - @ai-sdk/provider-utils@3.0.0-alpha.2

## 2.0.0-alpha.1

### Patch Changes

- Updated dependencies
  - ai@5.0.0-alpha.1
  - @ai-sdk/provider-utils@3.0.0-alpha.1

## 2.0.0-canary.23

### Patch Changes

- Updated dependencies
  - ai@5.0.0-canary.24
  - @ai-sdk/provider-utils@3.0.0-canary.19

## 2.0.0-canary.22

### Major Changes

- 40acf9b: feat (ui): introduce ChatStore and ChatTransport

### Patch Changes

- Updated dependencies [40acf9b]
  - @ai-sdk/provider-utils@3.0.0-canary.18
  - ai@5.0.0-canary.23

## 2.0.0-canary.21

### Patch Changes

- Updated dependencies
  - ai@5.0.0-canary.22

## 2.0.0-canary.20

### Patch Changes

- Updated dependencies
  - ai@5.0.0-canary.21
  - @ai-sdk/provider-utils@3.0.0-canary.17

## 2.0.0-canary.19

### Major Changes

- 496bbc1: chore (ui): inline/remove ChatRequest type

### Patch Changes

- Updated dependencies
  - ai@5.0.0-canary.20
  - @ai-sdk/provider-utils@3.0.0-canary.16

## 2.0.0-canary.18

### Patch Changes

- Updated dependencies
  - ai@5.0.0-canary.19

## 2.0.0-canary.17

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.15
  - ai@5.0.0-canary.18

## 2.0.0-canary.16

### Patch Changes

- c34ccd7: feat (ui/react): support resuming an ongoing stream
- Updated dependencies
  - ai@5.0.0-canary.17
  - @ai-sdk/provider-utils@3.0.0-canary.14

## 2.0.0-canary.15

### Patch Changes

- 6a0ff37: fix (react): integrate addToolResult into UseChatHelpers type without intersection
- Updated dependencies
  - ai@5.0.0-canary.16

## 2.0.0-canary.14

### Patch Changes

- Updated dependencies
  - ai@5.0.0-canary.15
  - @ai-sdk/provider-utils@3.0.0-canary.13

## 2.0.0-canary.13

### Patch Changes

- Updated dependencies
  - ai@5.0.0-canary.14
  - @ai-sdk/provider-utils@3.0.0-canary.12

## 2.0.0-canary.12

### Patch Changes

- Updated dependencies
  - ai@5.0.0-canary.13
  - @ai-sdk/provider-utils@3.0.0-canary.11

## 2.0.0-canary.11

### Patch Changes

- ai@5.0.0-canary.12
- @ai-sdk/provider-utils@3.0.0-canary.10

## 2.0.0-canary.10

### Patch Changes

- Updated dependencies [8e64e9c]
  - ai@5.0.0-canary.11
  - @ai-sdk/provider-utils@3.0.0-canary.9

## 2.0.0-canary.9

### Patch Changes

- Updated dependencies
  - ai@5.0.0-canary.10

## 2.0.0-canary.8

### Patch Changes

- Updated dependencies
  - ai@5.0.0-canary.9
  - @ai-sdk/provider-utils@3.0.0-canary.8

## 2.0.0-canary.7

### Patch Changes

- Updated dependencies
  - ai@5.0.0-canary.8
  - @ai-sdk/provider-utils@3.0.0-canary.7

## 2.0.0-canary.6

### Patch Changes

- Updated dependencies
  - ai@5.0.0-canary.7
  - @ai-sdk/provider-utils@3.0.0-canary.6

## 2.0.0-canary.5

### Patch Changes

- ai@5.0.0-canary.6
- @ai-sdk/provider-utils@3.0.0-canary.5

## 2.0.0-canary.4

### Patch Changes

- Updated dependencies
  - ai@5.0.0-canary.5
  - @ai-sdk/provider-utils@3.0.0-canary.4

## 2.0.0-canary.3

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.3
  - @ai-sdk/ui-utils@2.0.0-canary.3

## 2.0.0-canary.2

### Patch Changes

- @ai-sdk/provider-utils@3.0.0-canary.2
- @ai-sdk/ui-utils@2.0.0-canary.2

## 2.0.0-canary.1

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.1
  - @ai-sdk/ui-utils@2.0.0-canary.1

## 2.0.0-canary.0

### Major Changes

- d5f588f: AI SDK 5
- 9477ebb: chore (ui): remove useAssistant hook (**breaking change**)

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.0
  - @ai-sdk/ui-utils@2.0.0-canary.0

## 1.2.5

### Patch Changes

- a043b14: fix (ui): prevent early addToolResult submission
- Updated dependencies [28be004]
  - @ai-sdk/provider-utils@2.2.3
  - @ai-sdk/ui-utils@1.2.4

## 1.2.4

### Patch Changes

- Updated dependencies [b01120e]
  - @ai-sdk/provider-utils@2.2.2
  - @ai-sdk/ui-utils@1.2.3

## 1.2.3

### Patch Changes

- Updated dependencies [65243ce]
  - @ai-sdk/ui-utils@1.2.2

## 1.2.2

### Patch Changes

- d92fa29: feat: add credentials support to experimental useObject and StructuredObject

## 1.2.1

### Patch Changes

- Updated dependencies [f10f0fa]
  - @ai-sdk/provider-utils@2.2.1
  - @ai-sdk/ui-utils@1.2.1

## 1.2.0

### Minor Changes

- 5bc638d: AI SDK 4.2

### Patch Changes

- Updated dependencies [5bc638d]
  - @ai-sdk/provider-utils@2.2.0
  - @ai-sdk/ui-utils@1.2.0

## 1.1.25

### Patch Changes

- Updated dependencies [d0c4659]
  - @ai-sdk/provider-utils@2.1.15
  - @ai-sdk/ui-utils@1.1.21

## 1.1.24

### Patch Changes

- @ai-sdk/provider-utils@2.1.14
- @ai-sdk/ui-utils@1.1.20

## 1.1.23

### Patch Changes

- @ai-sdk/provider-utils@2.1.13
- @ai-sdk/ui-utils@1.1.19

## 1.1.22

### Patch Changes

- Updated dependencies [1531959]
  - @ai-sdk/provider-utils@2.1.12
  - @ai-sdk/ui-utils@1.1.18

## 1.1.21

### Patch Changes

- @ai-sdk/provider-utils@2.1.11
- @ai-sdk/ui-utils@1.1.17

## 1.1.20

### Patch Changes

- 6255fbc: fix (ai/react): update messages when initialMessages changes

## 1.1.19

### Patch Changes

- da5c734: fix (react): infinite re-render caused by fillMessageParts

## 1.1.18

### Patch Changes

- Updated dependencies [ddf9740]
  - @ai-sdk/ui-utils@1.1.16
  - @ai-sdk/provider-utils@2.1.10

## 1.1.17

### Patch Changes

- @ai-sdk/provider-utils@2.1.9
- @ai-sdk/ui-utils@1.1.15

## 1.1.16

### Patch Changes

- 60c3220: fix (ui): set status to ready after stream was aborted

## 1.1.15

### Patch Changes

- c43df41: feat (ui): add useChat status

## 1.1.14

### Patch Changes

- Updated dependencies [2e898b4]
  - @ai-sdk/provider-utils@2.1.8
  - @ai-sdk/ui-utils@1.1.14

## 1.1.13

### Patch Changes

- Updated dependencies [3ff4ef8]
  - @ai-sdk/provider-utils@2.1.7
  - @ai-sdk/ui-utils@1.1.13

## 1.1.12

### Patch Changes

- Updated dependencies [166e09e]
  - @ai-sdk/ui-utils@1.1.12

## 1.1.11

### Patch Changes

- Updated dependencies [318b351]
  - @ai-sdk/ui-utils@1.1.11

## 1.1.10

### Patch Changes

- bcc61d4: feat (ui): introduce message parts for useChat
- Updated dependencies [bcc61d4]
  - @ai-sdk/ui-utils@1.1.10

## 1.1.9

### Patch Changes

- Updated dependencies [6b8cc14]
  - @ai-sdk/ui-utils@1.1.9

## 1.1.8

### Patch Changes

- @ai-sdk/provider-utils@2.1.6
- @ai-sdk/ui-utils@1.1.8

## 1.1.7

### Patch Changes

- 0d2d9bf: fix (ui): empty submits (with allowEmptySubmit) create user messages
- 0d2d9bf: fix (ui): single assistant message with multiple tool steps
- Updated dependencies [0d2d9bf]
  - @ai-sdk/ui-utils@1.1.7

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

- 6f4d063: fix (ai/react): cache addToolResult in useChat
- Updated dependencies [ed012d2]
  - @ai-sdk/provider-utils@2.1.2
  - @ai-sdk/ui-utils@1.1.2

## 1.1.1

### Patch Changes

- Updated dependencies
  - @ai-sdk/ui-utils@1.1.1
  - @ai-sdk/provider-utils@2.1.1

## 1.1.0

### Minor Changes

- 62ba5ad: release: AI SDK 4.1

### Patch Changes

- Updated dependencies [62ba5ad]
  - @ai-sdk/provider-utils@2.1.0
  - @ai-sdk/ui-utils@1.1.0

## 1.0.14

### Patch Changes

- 44f04d5: feat (ai/react): expose chat id in experimental_prepareRequestBody

## 1.0.13

### Patch Changes

- Updated dependencies [33592d2]
  - @ai-sdk/ui-utils@1.0.12

## 1.0.12

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@2.0.8
  - @ai-sdk/ui-utils@1.0.11

## 1.0.11

### Patch Changes

- 37f4510: feat (ui): expose useChat id and send it to the server
- Updated dependencies [37f4510]
  - @ai-sdk/ui-utils@1.0.10

## 1.0.10

### Patch Changes

- Updated dependencies
  - @ai-sdk/ui-utils@1.0.9

## 1.0.9

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@2.0.7
  - @ai-sdk/ui-utils@1.0.8

## 1.0.8

### Patch Changes

- Updated dependencies
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

- 953469c: chore (ui): extract prepareAttachmentsForRequest
- Updated dependencies
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
- d3ae4f6: chore (ui/react): remove useObject setInput helper
- 68d30e9: chore (ui/react): remove experimental_addToolResult
- 7814c4b: chore (ui): remove streamMode setting from useChat & useCompletion
- ca3e586: chore (ui): remove experimental_useAssistant export
- fe4f109: chore (ui): set default value of useChat keepLastMessageOnError to true
- 84edae5: chore (release): bump ui package versions for 4.0 release

### Patch Changes

- 79c6dd9: fix (ui): remove unnecessary calls to mutateStreamData in useChat
- 04d3747: chore (ui-utils): restructure processAssistantMessage
- Updated dependencies
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

### Major Changes

- d3ae4f6: chore (ui/react): remove useObject setInput helper

### Patch Changes

- Updated dependencies
  - @ai-sdk/ui-utils@1.0.0-canary.5
  - @ai-sdk/provider-utils@2.0.0-canary.3

## 1.0.0-canary.4

### Major Changes

- ca3e586: chore (ui): remove experimental_useAssistant export

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@2.0.0-canary.2
  - @ai-sdk/ui-utils@1.0.0-canary.4

## 1.0.0-canary.3

### Major Changes

- 68d30e9: chore (ui/react): remove experimental_addToolResult

### Patch Changes

- Updated dependencies [b1da952]
  - @ai-sdk/provider-utils@2.0.0-canary.1
  - @ai-sdk/ui-utils@1.0.0-canary.3

## 1.0.0-canary.2

### Major Changes

- e117b54: chore (ui): remove deprecated useChat roundtrip options
- 7814c4b: chore (ui): remove streamMode setting from useChat & useCompletion

### Patch Changes

- Updated dependencies
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

## 0.0.70

### Patch Changes

- 2dfb93e: feat (ui/react): introduce experimental_throttle in useChat, useCompletion

## 0.0.69

### Patch Changes

- Updated dependencies [a85c965]
  - @ai-sdk/ui-utils@0.0.50

## 0.0.68

### Patch Changes

- 8301e41: fix (ai/react): update React peer dependency version to allow rc releases.

## 0.0.67

### Patch Changes

- Updated dependencies [3bf8da0]
  - @ai-sdk/ui-utils@0.0.49

## 0.0.66

### Patch Changes

- aa98cdb: chore: more flexible dependency versioning
- Updated dependencies
  - @ai-sdk/provider-utils@1.0.22
  - @ai-sdk/ui-utils@0.0.48

## 0.0.65

### Patch Changes

- @ai-sdk/provider-utils@1.0.21
- @ai-sdk/ui-utils@0.0.47

## 0.0.64

### Patch Changes

- 98a3b08: fix (ui/react): fix callback dependency

## 0.0.63

### Patch Changes

- caedcda: feat (ai/ui): add setData helper to useChat

## 0.0.62

### Patch Changes

- @ai-sdk/provider-utils@1.0.20
- @ai-sdk/ui-utils@0.0.46

## 0.0.61

### Patch Changes

- Updated dependencies [cd77c5d]
  - @ai-sdk/ui-utils@0.0.45

## 0.0.60

### Patch Changes

- 7e7104f: feat (ai/react): add headers option to useObject

## 0.0.59

### Patch Changes

- Updated dependencies [273f696]
  - @ai-sdk/provider-utils@1.0.19
  - @ai-sdk/ui-utils@0.0.44

## 0.0.58

### Patch Changes

- 54862e4: fix (react): restore sending annotations with during submission
- Updated dependencies [1f590ef]
  - @ai-sdk/ui-utils@0.0.43

## 0.0.57

### Patch Changes

- Updated dependencies [14210d5]
  - @ai-sdk/ui-utils@0.0.42

## 0.0.56

### Patch Changes

- a0403d6: feat (react): support sending attachments using append

## 0.0.55

### Patch Changes

- Updated dependencies [03313cd]
  - @ai-sdk/provider-utils@1.0.18
  - @ai-sdk/ui-utils@0.0.41

## 0.0.54

### Patch Changes

- 4ab883f: fix (ai/react): useObject error handling

## 0.0.53

### Patch Changes

- Updated dependencies [aa2dc58]
  - @ai-sdk/ui-utils@0.0.40

## 0.0.52

### Patch Changes

- @ai-sdk/provider-utils@1.0.17
- @ai-sdk/ui-utils@0.0.39

## 0.0.51

### Patch Changes

- Updated dependencies [d151349]
  - @ai-sdk/ui-utils@0.0.38

## 0.0.50

### Patch Changes

- Updated dependencies [09f895f]
  - @ai-sdk/provider-utils@1.0.16
  - @ai-sdk/ui-utils@0.0.37

## 0.0.49

### Patch Changes

- Updated dependencies [b5a82b7]
  - @ai-sdk/ui-utils@0.0.36

## 0.0.48

### Patch Changes

- Updated dependencies [d67fa9c]
  - @ai-sdk/provider-utils@1.0.15
  - @ai-sdk/ui-utils@0.0.35

## 0.0.47

### Patch Changes

- @ai-sdk/provider-utils@1.0.14
- @ai-sdk/ui-utils@0.0.34

## 0.0.46

### Patch Changes

- b6c1dee: fix (ui/react): allow sending empty messages with attachments

## 0.0.45

### Patch Changes

- @ai-sdk/provider-utils@1.0.13
- @ai-sdk/ui-utils@0.0.33

## 0.0.44

### Patch Changes

- Updated dependencies [dd712ac]
  - @ai-sdk/provider-utils@1.0.12
  - @ai-sdk/ui-utils@0.0.32

## 0.0.43

### Patch Changes

- @ai-sdk/provider-utils@1.0.11
- @ai-sdk/ui-utils@0.0.31

## 0.0.42

### Patch Changes

- e9c891d: feat (ai/react): useObject supports non-Zod schemas
- Updated dependencies
  - @ai-sdk/ui-utils@0.0.30
  - @ai-sdk/provider-utils@1.0.10

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

- Updated dependencies
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
- Updated dependencies
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

- Updated dependencies
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

- Updated dependencies
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
