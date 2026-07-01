---
'ai': patch
---

fix(ai): wrap unparseable tool call input in a JSON object instead of storing the raw string, preventing API rejections (e.g. Amazon Bedrock) on the next step
