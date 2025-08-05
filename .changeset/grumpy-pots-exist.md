---
'@ai-sdk/codemod': patch
---

### new codemode for: "`createIdGenerator()` now requires a size argument"

The codemod added in this change addresses the following change in v5

Before:

```ts
import { createIdGenerator } from 'ai';

const generator = createIdGenerator({ prefix: 'msg' });
const id2 = generator(16); // Custom size at call time
```

After:

```ts
import { createIdGenerator } from 'ai';

const generator32 = createIdGenerator({ size: 32 });
const id1 = generator32(); // Fixed size from creation

const generator16 = createIdGenerator({ prefix: 'msg', size: 16 });
const id2 = generator16(); // Fixed size from creation
```
