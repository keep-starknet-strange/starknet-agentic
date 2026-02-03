import type { Category } from "@/data/types";

interface CategoryCardProps {
  category: Category;
}

export function CategoryCard({ category }: CategoryCardProps) {
  return (
    <article className="neo-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-10 h-10 ${category.color} border-2 border-black shadow-neo-sm flex items-center justify-center text-lg`}
          role="img"
          aria-label={category.title}
        >
          {category.icon}
        </div>
        <h3 className="font-heading font-bold text-lg">{category.title}</h3>
      </div>
      <p className="font-body text-sm text-neo-dark/70">{category.description}</p>
    </article>
  );
}
