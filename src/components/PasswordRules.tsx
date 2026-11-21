import { passwordRules } from "@/lib/password";
import { PaperIcon } from "@/components/PaperIcon";
import { CheckIcon, DotIcon } from "@/components/icons";

export function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="grid grid-cols-1 gap-1.5 text-sm">
      {passwordRules.map((r) => {
        const ok = r.test(password);
        return (
          <li key={r.id} className="flex items-center gap-2.5">
            <PaperIcon
              shape="circle"
              tone={ok ? "chartreuse" : "cream"}
              back={null}
              rotate={0}
              className="h-5 w-5 shrink-0"
            >
              {ok ? <CheckIcon className="h-3 w-3" /> : <DotIcon className="h-3 w-3" />}
            </PaperIcon>
            <span className={ok ? "font-semibold text-crust" : "text-muted-foreground"}>{r.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
