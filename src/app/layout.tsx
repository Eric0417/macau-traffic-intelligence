import type { Metadata } from "next";
import { Noto_Sans_TC } from "next/font/google";
import { APP_DESCRIPTION, APP_NAME, APP_NAME_EN } from "@/lib/config";
import "./globals.css";
import "./workspace.css";

const interfaceFont = Noto_Sans_TC({
  variable: "--font-interface",
  display: "swap",
  preload: false,
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${APP_NAME} | ${APP_NAME_EN}`,
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  openGraph: {
    title: `${APP_NAME} | ${APP_NAME_EN}`,
    description: APP_DESCRIPTION,
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`h-full antialiased ${interfaceFont.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
