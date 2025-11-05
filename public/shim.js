// public/shim.js
// EARLY shim: runs before React hydration. Rewrites legacy /analyze calls (fetch, XHR, FORM) -> /api/analyze
(function () {
  var targets = [
    'http://localhost:8000/analyze',
    'https://localhost:8000/analyze',
    'http://127.0.0.1:8000/analyze',
    'https://127.0.0.1:8000/analyze',
    'https://datapredictor.onrender.com/analyze',
    '/analyze'
  ];
  function isLegacy(u){ try{u=String(u||'');}catch(e){u='';} return targets.some(function(t){ return u.indexOf(t)===0; }); }
  function toLocal(){ return '/api/analyze'; }

  // fetch
  var origFetch = window.fetch; if (origFetch) {
    window.fetch = function(input, init){
      if (typeof input === 'string' && isLegacy(input)) input = toLocal();
      else if (input && input.url && isLegacy(input.url)) input = new Request(toLocal(), input);
      return origFetch(input, init);
    };
  }
  // XHR
  if (window.XMLHttpRequest) {
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url){
      var newUrl = isLegacy(url) ? toLocal() : url;
      return origOpen.apply(this, [method, newUrl].concat([].slice.call(arguments,2)));
    };
  }
  // FORM
  function patchForms(root){
    var forms = (root||document).querySelectorAll('form[action]');
    for (var i=0;i<forms.length;i++){
      var f = forms[i];
      var a = f.getAttribute('action') || '';
      if (isLegacy(a)) f.setAttribute('action', toLocal());
      if (!f.__shimBound){
        f.addEventListener('submit', function(ev){
          var act = this.getAttribute('action') || '';
          if (isLegacy(act)) { ev.preventDefault(); this.setAttribute('action', toLocal()); this.submit(); }
        });
        f.__shimBound = true;
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ patchForms(document); });
  else patchForms(document);
  var mo = new MutationObserver(function(muts){
    muts.forEach(function(m){
      if (m.addedNodes) for (var i=0;i<m.addedNodes.length;i++){
        var n = m.addedNodes[i];
        if (n.nodeType === 1) patchForms(n);
      }
    });
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  console.debug('[early-shim] legacy /analyze -> /api/analyze');
})();