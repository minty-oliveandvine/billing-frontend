import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Payment Request",
  description: "Payment Request",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="m-0 min-w-0 overflow-x-clip antialiased">
        <ToastProvider>
          <div id="app-scroll-root" className="min-h-dvh min-h-screen w-full min-w-0 max-w-full">
            {children}
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
