const partyCode = /^[a-z0-9]{6}$/i;

export function readPartyInvitation(value: string): string | undefined {
  const input = value.trim();
  const compact = input.replace(/[ -]/g, "");
  if (partyCode.test(compact)) return compact.toUpperCase();
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    const match = /^\/(?:party|journey\/join)\/([a-z0-9]{6})\/?$/i.exec(url.pathname);
    return match?.[1]?.toUpperCase();
  } catch {
    return;
  }
}
