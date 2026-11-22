import { createFileRoute, Navigate } from "@tanstack/react-router";

// Keep old bookmarks usable; the standalone map screen has been retired.
export const Route = createFileRoute("/party/$code_/map")({
  head: () => ({
    meta: [
      { title: "Open your plan map — Baggle" },
      { name: "description", content: "Open your crew's shared event and live map on Baggle." },
      { property: "og:title", content: "Your plan map — Baggle" },
      { property: "og:description", content: "Meet your crew at the selected event on the shared live map." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RetiredMap,
});

function RetiredMap() {
  const { code } = Route.useParams();
  return <Navigate to="/party/$code/plan" params={{ code }} search={{}} replace />;
}
