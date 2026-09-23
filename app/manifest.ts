import type { MetadataRoute } from "next";

// Lets phones install the calculator to the home screen and open it like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FinexisEdu University Fee Calculator",
    short_name: "FinexisEdu",
    description:
      "Compare total university fees, and optionally living costs, in SGD for degrees in Singapore and abroad.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1e3a8a",
    categories: ["education", "finance"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
