import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CartPrice",
  description: "Compare nearby grocery totals with taxes, bag fees, and open-now filters.",
  icons: {
    icon: "/cartprice-tab-favicon-v4.png",
    shortcut: "/cartprice-tab-favicon-v4.png",
    apple: "/cartprice-app-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
