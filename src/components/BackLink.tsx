import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export function BackLink({ to = "/" }: { to?: "/" | "/auth" }) {
  return <Link to={to} className="mb-5 inline-flex items-center gap-2 text-sm font-bold underline-offset-4 hover:underline"><ArrowLeft className="h-4 w-4" />Back</Link>;
}