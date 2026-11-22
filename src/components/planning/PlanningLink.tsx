import { Link } from "@tanstack/react-router";
import { CalendarDays, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PlanningLink({ code, children }: { code: string; children: React.ReactNode }) {
  return <Button asChild className="paper mt-4 h-auto min-h-12 w-full whitespace-normal rounded-lg border-2 border-crust bg-sage px-4 py-3 font-display font-extrabold text-crust shadow-pop pop-press hover:bg-sage">
    <Link to="/party/$code/plan" params={{ code }}><CalendarDays aria-hidden="true" />{children}<ArrowRight aria-hidden="true" /></Link>
  </Button>;
}