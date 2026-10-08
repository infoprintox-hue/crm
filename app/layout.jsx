import './globals.css';
import './final6-base.css';
import './final6-v68.css';
import './final6-tail.css';
import './react-exact-adapter.css';
import './billing-studio.css';

export const metadata = {
  title: 'Visitinglink Business OS',
  description: 'Sales, delivery, billing and team operations for Visitinglink',
  manifest: '/manifest.json',
  icons: {
    icon: '/assets/icon-192.png',
    apple: '/assets/apple-touch-icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#dfe8e8',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="v68-ui">{children}</body>
    </html>
  );
}
