import { MARQUEE_ITEMS } from "@/data/marquee";

export function MarqueeBanner() {
  return (
    <div
      className="border-y-2 border-black bg-neo-dark text-white py-4 overflow-hidden marquee-container"
      aria-label="Feature highlights"
    >
      <div className="flex motion-safe:animate-marquee">
        {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="font-heading font-bold text-sm md:text-base whitespace-nowrap px-6 flex items-center gap-3"
          >
            <span
              className="w-2 h-2 bg-neo-yellow rotate-45 shrink-0"
              aria-hidden="true"
            />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
