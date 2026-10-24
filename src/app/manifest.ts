import type { MetadataRoute } from "next";

// "Add to Home screen" so Bharat and members open the app like any other on their phone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vihan Fitness",
    short_name: "Vihan",
    description: "Membership, check-ins and fees for Vihan Fitness, Nagothane.",
    start_url: "/login",
    display: "standalone",
    background_color: "#f3efe6",
    theme_color: "#121210",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
