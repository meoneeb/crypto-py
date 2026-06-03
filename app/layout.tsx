import "./globals.css";
import { Figtree } from "next/font/google";

import { Nav } from "@/components/Nav";
import { SessionProvider } from "@/components/SessionProvider";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  title: "Futures Desk",
  description: "Binance USDT-M futures trading with EMA + RSI signals",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={figtree.className}>
        <SessionProvider>
          <Nav />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
