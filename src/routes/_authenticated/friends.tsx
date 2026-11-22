import { createFileRoute, Link } from "@tanstack/react-router";
import { FriendsCard } from "@/components/FriendsCard";

export const Route = createFileRoute("/_authenticated/friends")({
  head: () => ({
    meta: [
      { title: "Friends — Baggle" },
      { name: "description", content: "Add friends by username and manage friend requests on Baggle." },
      { property: "og:title", content: "Friends — Baggle" },
      { property: "og:description", content: "Add friends and manage friend requests on Baggle." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Friends,
});

function Friends() {
  return (
    <main className="paper min-h-dvh bg-offwhite px-5 py-8 text-crust sm:px-8">
      <div className="mx-auto w-full max-w-2xl">
        <Link to="/home" className="text-sm font-bold underline underline-offset-4">← Dashboard</Link>
        <div className="mt-4"><FriendsCard /></div>
      </div>
    </main>
  );
}
