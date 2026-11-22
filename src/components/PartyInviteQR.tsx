import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export const partyJoinUrl = (origin: string, code: string) =>
  new URL(`/party/${encodeURIComponent(code)}`, origin).href;
export function PartyInviteQR({ code }: { code: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    setUrl(partyJoinUrl(window.location.origin, code));
  }, [code]);
  return (
    <div className="mt-6 flex items-center gap-5 border-y-2 border-crust/15 py-5">
      <div className="h-32 w-32 shrink-0 bg-offwhite text-crust">
        {url ? (
          <a href={url} aria-label="Open this party invitation">
            <QRCodeSVG
              value={url}
              size={128}
              level="M"
              marginSize={4}
              bgColor="transparent"
              fgColor="currentColor"
              title={`Join party ${code}`}
            />
          </a>
        ) : (
          <span role="status" className="text-xs">
            Preparing invitation…
          </span>
        )}
      </div>
      <div className="min-w-0">
        <h2 className="font-extrabold">Bring your people.</h2>
        <p className="mt-2 text-sm text-muted-foreground">Scan to join this party.</p>
      </div>
    </div>
  );
}
