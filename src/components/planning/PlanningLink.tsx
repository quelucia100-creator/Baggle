import { Link } from "@tanstack/react-router";
import { CalendarDays, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PlanningLink({
  code,
  children,
  step,
}: {
  code: string;
  children: React.ReactNode;
  step?: "day" | "budget";
}) {
  return (
    <Button
      asChild
      className="paper mt-4 h-auto min-h-12 w-full whitespace-normal rounded-lg border-2 border-crust bg-tangerine px-4 py-3 font-display font-extrabold text-crust shadow-pop pop-press hover:bg-apricot"
    >
      <Link to="/party/$code/plan" params={{ code }} search={step ? { step } : {}}>
        <CalendarDays aria-hidden="true" />
        {children}
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}
