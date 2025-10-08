---
'@ai-sdk/gateway': patch
---

fix(provider/gateway): add "react-native" as export condition for browser behavior

This avoids the use of native Node APIs in bundles created for React Native / Expo apps
