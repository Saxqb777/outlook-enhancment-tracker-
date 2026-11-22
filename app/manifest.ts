import type { MetadataRoute } from "next";

/** Lets phones and computers install the site like an app (needed for notifications on iPhone). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shipping Tickets",
    short_name: "Tickets",
    description: "Turn emails into tracked work for your team.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#E7E9EC",
    theme_color: "#E7E9EC",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
