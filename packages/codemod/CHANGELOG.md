# @ai-sdk/codemod

## 1.0.2

### Patch Changes

- 5d902a7: feat (packages/codemod): Don't generate duplicate token usage imports.
- c4e1192: fix (codemod): Filter more dirs/files unlikely to need transform.

## 1.0.1

### Patch Changes

- ff0676c: chore (packages/codemod): Remove semver dependency.

## 1.0.0

### Major Changes

- 86b4045: chore (release): bump major version to 1.0 in prep for 4.0 release

### Patch Changes

- 977eb23: feat (packages/codemod): Add codemod to replace continuation steps.
- 7326f22: fix (packages/codemod): Remove package version check pre-upgrade.
- 7c205ba: feat (packages/codemod): Added codemod to rm metadata w/ headers.
- 09f6d27: feat (packages/codemod): Set up package for automated migrations.
- a2e0f02: fix (packages/codemod): Ignore code under dot-prefixed dirs.
- 6b7fd20: feat (packages/codemod): Add codemod to rename formatStreamPart.
- 7e19003: feat (packages/codemod): Add codemod to rm isXXXError methods.
- 4dc9622: feat (packages/codemod): Add codemod to rename parseStreamPart.
- 0df618b: fix (packages/codemod): Only rename baseUrl in create-provider calls.
- bffedb0: feat (packages/codemod): Improve codemod CLI logging.
- 01b8e1c: feat (package/codemod): Add upgrade command to run codemod bundle.
- cb91fe3: feat (packages/codemod): Add codemod to remove provider facades.
- 9c9ae64: feat (packages/codemod): Add codemod to replace token usage types.
- c5ff26d: feat (packages/codemod): Add codemod to remove experimental msg types.
- e2093fe: feat (packages/codemod): Add codemod to replace langchain toAIStream.
- ba0dfc0: feat (packages/codemod): Show progress bar during upgrade.
- 66373dd: fix (packages/codemod): Only mutate files when changes are needed.
- c33e632: feat (packages/codemod): Add codemod to rm experimental_StreamData.
- 030f327: feat (packages/codemod): Add more automated transformations for 4.0.
- b1d9efb: fix (packages/codemod): Only rename nanoid on import from 'ai'.
- 29556ed: feat (packages/codemod): Add script to scaffold new codemod.
- 575e7da: feat (packages/codemod): Add codemod to remove ExperimentalTool.
- 94c51ae: fix (packages/codemod): Only replace ai-sdk provider ctors.
- 1931f4f: feat (providers/codemod): Add codemod to remove deprecated prov reg exports.
- b183ed0: feat (packages/codemod): Improve error handling and logging.
- 2523330: feat (package/codemod): Add codemod to replace roundtrips.
- 194a3eb: feat (packages/codemod): Add codemod to rm experimental useAssistant.
- 45feb29: feat (packages/codemod): codemod to rm await from streamText/Object.

## 1.0.0-canary.7

### Patch Changes

- ba0dfc0: feat (packages/codemod): Show progress bar during upgrade.
- 66373dd: fix (packages/codemod): Only mutate files when changes are needed.

## 1.0.0-canary.6

### Patch Changes

- 7326f22: fix (packages/codemod): Remove package version check pre-upgrade.
- a2e0f02: fix (packages/codemod): Ignore code under dot-prefixed dirs.
- b1d9efb: fix (packages/codemod): Only rename nanoid on import from 'ai'.
- b183ed0: feat (packages/codemod): Improve error handling and logging.
- 45feb29: feat (packages/codemod): codemod to rm await from streamText/Object.

## 1.0.0-canary.5

### Major Changes

- 86b4045: chore (release): bump major version to 1.0 in prep for 4.0 release

### Patch Changes

- 977eb23: feat (packages/codemod): Add codemod to replace continuation steps.
- 7c205ba: feat (packages/codemod): Added codemod to rm metadata w/ headers.
- 6b7fd20: feat (packages/codemod): Add codemod to rename formatStreamPart.
- 7e19003: feat (packages/codemod): Add codemod to rm isXXXError methods.
- 4dc9622: feat (packages/codemod): Add codemod to rename parseStreamPart.
- 0df618b: fix (packages/codemod): Only rename baseUrl in create-provider calls.
- c33e632: feat (packages/codemod): Add codemod to rm experimental_StreamData.
- 575e7da: feat (packages/codemod): Add codemod to remove ExperimentalTool.
- 194a3eb: feat (packages/codemod): Add codemod to rm experimental useAssistant.

## 0.0.1-canary.4

### Patch Changes

- bffedb0: feat (packages/codemod): Improve codemod CLI logging.
- 94c51ae: fix (packages/codemod): Only replace ai-sdk provider ctors.

## 0.0.1-canary.3

### Patch Changes

- cb91fe3: feat (packages/codemod): Add codemod to remove provider facades.
- 9c9ae64: feat (packages/codemod): Add codemod to replace token usage types.
- c5ff26d: feat (packages/codemod): Add codemod to remove experimental msg types.
- e2093fe: feat (packages/codemod): Add codemod to replace langchain toAIStream.
- 29556ed: feat (packages/codemod): Add script to scaffold new codemod.
- 1931f4f: feat (providers/codemod): Add codemod to remove deprecated prov reg exports.
- 2523330: feat (package/codemod): Add codemod to replace roundtrips.

## 0.0.1-canary.2

### Patch Changes

- 01b8e1c: feat (package/codemod): Add upgrade command to run codemod bundle.

## 0.0.1-canary.1

### Patch Changes

- 030f327: feat (packages/codemod): Add more automated transformations for 4.0.

## 0.0.1-canary.0

### Patch Changes

- 09f6d27: feat (packages/codemod): Set up package for automated migrations.
