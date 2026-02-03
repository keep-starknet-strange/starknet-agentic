import type { Stat } from "@/data/types";

interface StatCardProps {
  stat: Stat;
}

export function StatCard({ stat }: StatCardProps) {
  return (
    <div className="neo-card p-5 text-center">
      <div className="font-heading font-black text-2xl md:text-3xl text-neo-purple">
        {stat.value}
      </div>
      <div className="font-body text-sm text-neo-dark/60 mt-1">{stat.label}</div>
    </div>
  );
}
