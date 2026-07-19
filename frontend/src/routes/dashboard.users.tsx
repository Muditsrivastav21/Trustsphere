import { createFileRoute } from "@tanstack/react-router";
import { DashHeader } from "@/components/Sidebar";
import { MiniTrustRing } from "@/components/TrustRing";

export const Route = createFileRoute("/dashboard/users")({
  head: () => ({ meta: [{ title: "Users · TrustSphere" }] }),
  component: UsersPage,
});

const users = [
  { name: "Rahul Sharma", id: "BOB1029384", trust: 92, type: "Premium", sessions: 142, devices: 2 },
  { name: "Priya Verma", id: "BOB7745210", trust: 71, type: "Savings", sessions: 88, devices: 3 },
  { name: "Anil Kumar", id: "BOB3398124", trust: 88, type: "Current", sessions: 210, devices: 1 },
  { name: "Sneha Mehta", id: "BOB5582019", trust: 81, type: "Premium", sessions: 64, devices: 2 },
  { name: "Vikram Joshi", id: "BOB6691437", trust: 54, type: "Savings", sessions: 33, devices: 4 },
  { name: "Aarti Patel", id: "BOB9912008", trust: 95, type: "Premium", sessions: 305, devices: 2 },
  { name: "Unknown", id: "BOB0042197", trust: 28, type: "Savings", sessions: 7, devices: 6 },
];

function UsersPage() {
  return (
    <div>
      <DashHeader title="Customer Trust Registry" subtitle="Per-customer trust profile across all banking channels." />
      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[var(--color-text-muted)] bg-[var(--color-navy)]">
            <tr className="label-caps text-left">
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-5 py-3 font-medium">Customer ID</th>
              <th className="px-5 py-3 font-medium">Account</th>
              <th className="px-5 py-3 font-medium text-right">Sessions (30d)</th>
              <th className="px-5 py-3 font-medium text-right">Devices</th>
              <th className="px-5 py-3 font-medium text-center">Trust</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-[var(--color-navy-border)] hover:bg-[var(--color-bob-orange-muted)] transition">
                <td className="px-5 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--color-navy)] border border-[var(--color-navy-border)] flex items-center justify-center text-xs font-bold">
                    {u.name.split(" ").map(s=>s[0]).join("").slice(0,2)}
                  </div>
                  <div>{u.name}</div>
                </td>
                <td className="px-5 py-3 font-mono text-xs text-[var(--color-text-secondary)]">{u.id}</td>
                <td className="px-5 py-3"><span className="chip chip-neutral">{u.type}</span></td>
                <td className="px-5 py-3 text-right font-mono">{u.sessions}</td>
                <td className="px-5 py-3 text-right font-mono">{u.devices}</td>
                <td className="px-5 py-3"><div className="flex justify-center items-center gap-2"><MiniTrustRing score={u.trust}/><span className="font-mono text-xs">{u.trust}</span></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
