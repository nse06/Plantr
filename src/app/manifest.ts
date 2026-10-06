import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Plantr: your garden, planned",
    short_name: "Plantr",
    description: "Personalized garden plans, planting calendars and weekly reminders.",
    start_url: "/garden",
    display: "standalone",
    background_color: "#fbf8f1",
    theme_color: "#2f6b3b",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
