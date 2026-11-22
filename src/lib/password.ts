export const passwordRules = [
  { id: "len", label: "At least 10 characters", test: (p: string) => p.length >= 10 },
  { id: "upper", label: "An uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { id: "lower", label: "A lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { id: "num", label: "A number", test: (p: string) => /\d/.test(p) },
  { id: "sym", label: "A symbol (!@#$…)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

export const isStrongPassword = (p: string) => passwordRules.every((r) => r.test(p));

export const normalizePartyCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

export const makePartyCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};
