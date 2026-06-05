"use client"; // marks this as a client component so hooks (useState, useEffect) are available

import { useState, useEffect } from "react";

type Service = {
  id: string;
  name: string;
  status: "operational" | "degraded" | "down";
  last_updated: string;
};

function formatLocalTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString();
}

function timeAgo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// maps each status value to a Tailwind background color for the dot
const statusColor: Record<Service["status"], string> = {
  operational: "bg-green-500",
  degraded: "bg-yellow-400",
  down: "bg-red-500",
};

export default function Home() {
  const [services, setServices] = useState<Service[]>([]);
  // true while the first (or any) fetch is in flight
  const [loading, setLoading] = useState(true);
  // holds an error message if the fetch fails, otherwise null
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // extracted so it can be called on mount and by the interval
    async function fetchServices() {
      try {
        // NEXT_PUBLIC_API_URL is set in .env.local so the backend URL isn't hardcoded and can differ between dev and production
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/services`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data: Service[] = await res.json();
        setServices(data);
        setError(null);
      } catch (err) {
        // capture the message so we can display it in red
        setError(err instanceof Error ? err.message : "Failed to fetch");
      } finally {
        setLoading(false);
      }
    }

    fetchServices();

    // re-fetch every 10 seconds to keep the list current
    const interval = setInterval(fetchServices, 10_000);

    // clean up the interval when the component unmounts to prevent timer leaks
    return () => clearInterval(interval);
  }, []);

  // show a loading indicator until the first fetch resolves
  if (loading) return <p className="p-6">Loading…</p>;

  // surface fetch errors in red so they are immediately visible
  if (error) return <p className="p-6 text-red-600">{error}</p>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">StatusPulse</h1>
      <ul className="space-y-3">
        {services.map((service) => (
          <li key={service.id} className="rounded border p-3">
            <div className="flex items-center gap-2 font-medium">
              {/* colored dot sized to sit inline with the service name */}
              <span className={`inline-block h-3 w-3 rounded-full ${statusColor[service.status]}`} />
              {service.name}
            </div>
            <div>Status: {service.status}</div>
            <div>Last updated: {formatLocalTime(service.last_updated)}</div>
            <div className="text-sm text-gray-600">({timeAgo(service.last_updated)})</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
