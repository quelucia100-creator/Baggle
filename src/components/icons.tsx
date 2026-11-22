type IconProps = { className?: string };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function TicketIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        {...stroke}
        d="M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v1.2a2.3 2.3 0 0 0 0 4.6v1.2A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-1.2a2.3 2.3 0 0 0 0-4.6z"
      />
      <path {...stroke} strokeWidth={1.8} strokeDasharray="1.5 2.5" d="M14 7v10" />
    </svg>
  );
}

export function BagelIcon({ className = "h-6 w-6", seasoned = true }: IconProps & { seasoned?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle {...stroke} cx="12" cy="12" r="9" />
      <circle {...stroke} cx="12" cy="12" r="3.4" />
      {seasoned && <path {...stroke} strokeWidth={1.7} d="M8.6 8.2l1-1M12.6 6.2l.4 1.1M16 8.6l1.2.5M16.6 13.2l1.3.2M14.2 16.4l.8 1" />}
    </svg>
  );
}

export function MailIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect {...stroke} x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path {...stroke} d="m4.5 8 7.5 5 7.5-5" />
    </svg>
  );
}

export function CheckIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path {...stroke} strokeWidth={2.6} d="m4.5 12.5 4.8 4.8 10.2-11" />
    </svg>
  );
}

export function DotIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle {...stroke} cx="12" cy="12" r="6.5" />
    </svg>
  );
}

export function UsersIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle {...stroke} cx="9" cy="8" r="3.5" />
      <path {...stroke} d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path {...stroke} d="M16 5.3a3.5 3.5 0 0 1 0 5.5" />
      <path {...stroke} d="M17.6 13.8a5.5 5.5 0 0 1 2.9 4.9" />
    </svg>
  );
}

export function PinIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path {...stroke} d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
      <circle {...stroke} cx="12" cy="10" r="2.6" />
    </svg>
  );
}
