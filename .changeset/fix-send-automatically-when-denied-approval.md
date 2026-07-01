---
'ai': patch
---

fix(ai): treat a denied tool approval (`output-denied`) as a completed tool part so `sendAutomaticallyWhen` fires after an approval is denied.
