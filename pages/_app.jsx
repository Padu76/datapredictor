import '../styles/globals.css';
import FloatingQuickActions from '../components/FloatingQuickActions';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <FloatingQuickActions />
    </>
  );
}
