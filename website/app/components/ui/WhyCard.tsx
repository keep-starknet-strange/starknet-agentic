import type { WhyItem } from "@/data/types";

interface WhyCardProps {
  item: WhyItem;
}

export function WhyCard({ item }: WhyCardProps) {
  return (
    <article className="neo-card-hover p-8">
      <div
        className={`inline-flex items-center justify-center w-14 h-14 ${item.color} border-2 border-black shadow-neo-sm text-2xl mb-5`}
        aria-hidden="true"
      >
        {item.icon}
      </div>
      <h3 className="font-heading font-bold text-xl md:text-2xl mb-3">
        {item.title}
      </h3>
      <p className="font-body text-neo-dark/70 leading-relaxed">
        {item.description}
      </p>
    </article>
  );
}
