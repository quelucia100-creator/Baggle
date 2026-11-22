import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { localDate } from "@/lib/account-preferences";

export function BirthDatePicker({ value, onChange }: { value: string | null; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T12:00:00`) : undefined;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button variant="outline" aria-label="Date of birth" className="paper h-12 w-full justify-start border-2 border-crust bg-cream">
        <CalendarIcon />{selected ? format(selected, "PPP") : "Select date of birth"}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start">
      <Calendar mode="single" selected={selected} captionLayout="dropdown" startMonth={new Date(1900, 0)} endMonth={new Date()}
        defaultMonth={selected ?? new Date(2004, 0)} disabled={{ after: new Date() }} className="pointer-events-auto"
        onSelect={(date) => { if (date) { onChange(localDate(date)); setOpen(false); } }} />
    </PopoverContent>
  </Popover>;
}