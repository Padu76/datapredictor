// lib/fetch-shim.js
// Intercetta fetch, XHR e submit di <form> che puntano a endpoint legacy /analyze
(function () {
  if (typeof window === 'undefined') return;

  const targets = [
    'http://localhost:8000/analyze',
    'https://localhost:8000/analyze',
    'http://127.0.0.1:8000/analyze',
    'https://127.0.0.1:8000/analyze',
    'https://datapredictor.onrender.com/analyze',
    '/analyze'
  ];

  function isLegacy(url) {
    const u = String(url || '');
    return targets.some(t => u.startsWith(t));
  }
  function toLocal(url) {
    return '/api/analyze';
  }

  // ---- FETCH ----
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === 'string') {
      if (isLegacy(input)) input = toLocal(input);
    } else if (input && input.url && isLegacy(input.url)) {
      input = new Request(toLocal(input.url), input);
    }
    return origFetch(input, init);
  };

  // ---- XHR ----
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    const newUrl = isLegacy(url) ? toLocal(url) : url;
    return origOpen.apply(this, [method, newUrl].concat([].slice.call(arguments, 2)));
  };

  // ---- FORM SUBMIT ----
  function patchForms(root) {
    const forms = (root || document).querySelectorAll('form[action]');
    forms.forEach((f) => {
      const action = f.getAttribute('action') || '';
      if (isLegacy(action)) {
        f.setAttribute('action', toLocal(action));
      }
      // Listener di sicurezza: se qualcuno rimette l'URL legacy via JS al volo
      if (!f.__analyzeShimBound) {
        f.addEventListener('submit', (e) => {
          const a = f.getAttribute('action') || '';
          if (isLegacy(a)) {
            e.preventDefault();
            f.setAttribute('action', toLocal(a));
            f.submit();
          }
        });
        f.__analyzeShimBound = true;
      }
    });
  }

  // patch iniziale e su modifiche DOM (per React/Next)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => patchForms(document));
  } else {
    patchForms(document);
  }
  const mo = new MutationObserver((muts) => muts.forEach(m => m.addedNodes && m.addedNodes.forEach(n => {
    if (n.nodeType === 1) patchForms(n);
  })));
  mo.observe(document.documentElement, { childList: true, subtree: true });

  console.debug('[fetch-shim] legacy /analyze (fetch/xhr/form) → /api/analyze');
})();