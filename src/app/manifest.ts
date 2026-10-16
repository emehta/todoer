import type { MetadataRoute } from "next";

/** Lets the browser install Todoer as an app: Safari's Add to Dock, Chrome's Install. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Todoer",
    short_name: "Todoer",
    description: "A to-do list with goals, priorities and voice capture, on your own database.",
    start_url: "/tasks",
    scope: "/",
    display: "standalone",
    background_color: "#1c1c1c",
    theme_color: "#1c1c1c",
    icons: [
      // src/app/icon1.png and icon2.png, which Next also names in every page's head for the tab.
      { src: "/icon1.png", sizes: "192x192", type: "image/png" },
      { src: "/icon2.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
