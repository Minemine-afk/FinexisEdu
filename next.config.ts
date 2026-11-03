import type { NextConfig } from "next";

/**
 * Websites allowed to show the calculator inside an iframe.
 *
 * Empty list: any website may embed it (how the site has always behaved).
 * Once the list has entries, only those websites can embed it, and every
 * other site gets a blank frame. Write each one as a full origin, for example
 * "https://www.example.com". A "*." prefix covers every subdomain, for example
 * "https://*.example.com". Changes take effect on the next deploy.
 */
const EMBED_ALLOWED_SITES: string[] = [
  // "https://www.your-final-domain.com",
];

const frameAncestors = EMBED_ALLOWED_SITES.length ? `'self' ${EMBED_ALLOWED_SITES.join(" ")}` : "*";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The public calculator.
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors}` }],
      },
      // The editor is never shown inside another site's frame (a later match wins).
      ...["/admin", "/admin/:path*", "/api/:path*"].map((source) => ({
        source,
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      })),
    ];
  },
};

export default nextConfig;
