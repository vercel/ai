---
title: <script type="text/javascri...
---

<pre class="language-html" data-overflow="wrap"><code class="lang-html"><strong>&#x3C;script type="text/javascript">
</strong>  (function(d, t) {
      var v = d.createElement(t), s = d.getElementsByTagName(t)[0];
      v.onload = function() {
        window.voiceflow.chat.load({
          verify: { projectID: '671e8b0eff5ef3f747ccb6cc' },
          url: 'https://general-runtime.voiceflow.com',
          versionID: 'production'
        });
      }
      v.src = "https://cdn.voiceflow.com/widget/bundle.mjs"; v.type = "text/javascript"; s.parentNode.insertBefore(v, s);
  })(document, 'script');
&#x3C;/script>
</code></pre>
