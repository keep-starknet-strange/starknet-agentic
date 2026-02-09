import Link from "next/link";
import type { Skill } from "@/data/types";

interface SkillCardProps {
  skill: Skill;
}

export function SkillCard({ skill }: SkillCardProps) {
  return (
    <Link href={`/docs/skills/${skill.slug}`} className="block group">
      <article className="neo-card p-6 h-full transition-transform group-hover:-translate-y-1">
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`w-12 h-12 ${skill.color} border-2 border-black shadow-neo-sm flex items-center justify-center text-2xl`}
            role="img"
            aria-label={skill.title}
          >
            {skill.icon}
          </div>
          <div>
            <h3 className="font-heading font-bold text-lg group-hover:text-neo-purple transition-colors">
              {skill.title}
            </h3>
            <code className="text-xs text-neo-dark/60 font-mono">
              {skill.name}
            </code>
          </div>
        </div>

        <p className="font-body text-sm text-neo-dark/70 mb-4 line-clamp-2">
          {skill.description}
        </p>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {skill.keywords.slice(0, 4).map((keyword) => (
            <span
              key={keyword}
              className="px-2 py-0.5 text-xs bg-neo-dark/5 text-neo-dark/70 rounded"
            >
              {keyword}
            </span>
          ))}
          {skill.keywords.length > 4 && (
            <span className="px-2 py-0.5 text-xs text-neo-dark/50">
              +{skill.keywords.length - 4}
            </span>
          )}
        </div>

        <ul className="space-y-1">
          {skill.features.slice(0, 3).map((feature) => (
            <li
              key={feature}
              className="text-xs text-neo-dark/60 flex items-center gap-2"
            >
              <span className="w-1 h-1 bg-neo-purple rounded-full" />
              {feature}
            </li>
          ))}
        </ul>
      </article>
    </Link>
  );
}
