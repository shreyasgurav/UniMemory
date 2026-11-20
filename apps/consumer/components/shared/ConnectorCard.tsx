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
    <div className="bg-white rounded-xl border border-neutral-200 p-5 flex flex-col" aria-busy={busy}>
      <div className="flex items-start justify-between">
        <div className="w-11 h-11 rounded-xl border border-neutral-100 bg-white flex items-center justify-center">
          <img src={logo} alt="" className="w-6 h-6 object-contain" />
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${badge.pill}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
          {badge.text}
        </span>
      </div>

      <h3 className="mt-4 text-base font-semibold text-neutral-900">{name}</h3>
      <p className="mt-0.5 text-sm text-neutral-500 truncate" title={subtitle}>
        {subtitle}
      </p>

      <div className="mt-5">
        {connected ? (
          <button
            onClick={onDisconnect}
            disabled={busy}
            className="w-full h-10 rounded-lg border border-neutral-200 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Disconnecting..." : "Disconnect"}
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={busy || inactive}
            className="w-full h-10 rounded-lg bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Connecting..." : "Connect"}
          </button>
        )}
      </div>
    </div>
  );
}
