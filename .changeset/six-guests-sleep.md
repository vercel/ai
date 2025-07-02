---
'@ai-sdk/vue': patch
---

fix (vue): update chat class reactivity

## Problem

In the new Vue `Chat` class, `messages` that were being passed as props or computed values were breaking the class' ability to update its internal state.

## Context

In Vue's reactivity system `ref.value.<push|pop>(item)` is problematic because it mutates the array directly and Vue won’t detect this change in some cases. Creating a new array allows Vue to correctly track and trigger updates to any reactive dependencies. (Vue tracks assignments (`=`), not mutations (`push`, `pop`, `splice`, etc.) on `.value`.)
