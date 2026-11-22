import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import OfficeScene from "@/components/OfficeScene";
import "./globals.css";
import "./work.css";

const onest = Onest({ subsets: ["latin"], display: "swap", variable: "--font-onest" });

export const metadata: Metadata = {
  title: { default: "Shipping Tickets", template: "%s · Shipping Tickets" },
  description: "Turn emails into tracked work for your team.",
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Tickets", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#E7E9EC",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={onest.variable}>
      <body>
        <OfficeScene />
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
