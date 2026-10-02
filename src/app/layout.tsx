import type { Metadata } from "next";
import { APP_DESCRIPTION, APP_NAME, APP_NAME_EN } from "@/lib/config";
import "./globals.css";

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
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
