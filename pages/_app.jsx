import '../apps/web/styles/globals.css';

// Import fetch shim on client only
if (typeof window !== 'undefined') {
  import('../lib/fetch-shim');
}

import FloatingQuickActions from '../components/FloatingQuickActions';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <FloatingQuickActions />
    </>
  );
}
