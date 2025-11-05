// lib/fetch-shim.js
// Client-side shim: reroute any legacy calls to localhost:8000/analyze or onrender/analyze → /api/analyze

(function() {
  if (typeof window === 'undefined') return;

  const targets = [
    'http://localhost:8000/analyze',
    'https://localhost:8000/analyze',
    'http://127.0.0.1:8000/analyze',
    'https://127.0.0.1:8000/analyze',
    'https://datapredictor.onrender.com/analyze',
    '/analyze' // legacy relative path
  ];

  function rewrite(url) {
    try {
      const u = String(url);
      if (targets.some(t => u.startsWith(t))) {
        return '/api/analyze';
      }
      return url;
    } catch (e) {
      return url;
    }
  }

  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === 'string') {
      input = rewrite(input);
    } else if (input && input.url) {
      input = new Request(rewrite(input.url), input);
    }
    return origFetch(input, init);
  };

  // Also patch XMLHttpRequest for older code paths
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    const newUrl = rewrite(url);
    return origOpen.apply(this, [method, newUrl].concat([].slice.call(arguments, 2)));
  };

  console.debug('[fetch-shim] legacy /analyze calls will be routed to /api/analyze');
})();