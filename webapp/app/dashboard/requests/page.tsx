"use client";

export default function RequestsPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Requests</h1>
        <p className="text-sm text-neutral-500 mt-2">
          Track and manage incoming requests from your integrations. This section will soon display detailed request logs and statistics.
        </p>
      </div>

      <div className="border border-dashed border-neutral-200 rounded-2xl p-8 bg-neutral-50/60 text-center">
        <p className="text-neutral-500 text-sm">
          Requests data isn&apos;t available yet. Stay tuned for updates.
        </p>
      </div>
    </div>
  );
}
