import type { Metadata } from "next";
import Intro from "./Intro";
import "./globals.css";

export const metadata: Metadata = {
  title: "InstaInfluence — influencer discovery & outreach",
  description:
    "Find Instagram influencers by country, pull their public contacts, and run outreach across email, Instagram and their other socials.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="glow glow-one" aria-hidden />
        <div className="glow glow-two" aria-hidden />
        <div className="glow glow-three" aria-hidden />
        <Intro />
        {children}
      </body>
    </html>
  );
}
