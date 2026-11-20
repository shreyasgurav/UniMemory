"use client";

export type ConnectorStatus = "loading" | "connected" | "disconnected" | "unavailable" | "error";

interface ConnectorCardProps {
  name: string;
  logo: string;
  description: string;
  status: ConnectorStatus;
  /** Shown instead of the description while connected (e.g. the Gmail address). */
  accountLabel?: string;
  busy?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

const BADGES: Record<ConnectorStatus, { text: string; pill: string; dot: string }> = {
  loading: { text: "Checking", pill: "bg-neutral-100 text-neutral-400", dot: "bg-neutral-300" },
  connected: { text: "Connected", pill: "bg-green-50 text-green-700", dot: "bg-green-500" },
  disconnected: { text: "Not connected", pill: "bg-neutral-100 text-neutral-500", dot: "bg-neutral-400" },
  unavailable: { text: "Coming soon", pill: "bg-neutral-100 text-neutral-400", dot: "bg-neutral-300" },
  error: { text: "Status unknown", pill: "bg-red-50 text-red-600", dot: "bg-red-400" },
};

export default function ConnectorCard({
  name,
  logo,
  description,
  status,
  accountLabel,
  busy = false,
  onConnect,
  onDisconnect,
}: ConnectorCardProps) {
  const badge = BADGES[status];
  const connected = status === "connected";
  const subtitle = connected && accountLabel ? accountLabel : description;
  const inactive = status === "loading" || status === "unavailable" || status === "error";

  return (
    <div
      className="flex items-center gap-4 bg-white rounded-xl px-4 py-3.5"
      aria-busy={busy}
    >
      <div className="w-10 h-10 shrink-0 rounded-lg bg-neutral-50 flex items-center justify-center">
        <img src={logo} alt="" className="w-5 h-5 object-contain" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold text-neutral-900 leading-tight">{name}</h3>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${badge.pill}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
            {badge.text}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] text-neutral-500 truncate" title={subtitle}>
          {subtitle}
        </p>
      </div>

      {connected ? (
        <button
          onClick={onDisconnect}
          disabled={busy}
          className="shrink-0 h-9 px-4 rounded-lg bg-red-50 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Disconnecting..." : "Disconnect"}
        </button>
      ) : (
        <button
          onClick={onConnect}
          disabled={busy || inactive}
          className={`shrink-0 h-9 px-4 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed ${
            inactive || busy
              ? "bg-neutral-100 text-neutral-400"
              : "bg-green-50 text-green-700 hover:bg-green-100"
          }`}
        >
          {busy ? "Connecting..." : "Connect"}
        </button>
      )}
    </div>
  );
}
