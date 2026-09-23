import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FinexisEdu: University Fee Calculator",
  description:
    "Compare total university fees, and optionally living costs, in SGD for Bachelor's and Master's degrees in Singapore, the UK, Australia, the US, Canada, New Zealand and Japan.",
  applicationName: "FinexisEdu",
  // iOS home-screen app: full screen, blue status bar, short title under the icon.
  appleWebApp: { capable: true, title: "FinexisEdu", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw under the notch/home indicator; the layout pads with safe-area insets.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1e3a8a" },
    { media: "(prefers-color-scheme: dark)", color: "#0f2a5c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
