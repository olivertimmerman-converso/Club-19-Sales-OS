import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Club 19 London | Atelier",
  description:
    "Elegant invoice creation and sales management for Club 19 London",
  icons: {
    icon: "/favicon.ico",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Club 19 Atelier",
  },
  other: {
    "theme-color": "#1c2331",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#1c2331",
          colorBackground: "#faf8f5",
          colorText: "#2d2d2d",
        },
        elements: {
          formButtonPrimary:
            "bg-club19-navy hover:bg-club19-navy-light text-club19-cream tracking-wide",
          card: "border border-club19-warmgrey rounded-xl",
        },
      }}
    >
      <html lang="en" className={`${cormorant.variable} ${montserrat.variable}`}>
        <body className={montserrat.className}>
          <ErrorBoundary>
            <div className="min-h-screen bg-club19-offwhite">{children}</div>
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
