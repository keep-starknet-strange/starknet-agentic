import type { ArchitectureLayer as ArchitectureLayerType } from "@/data/types";

interface ArchitectureLayerProps {
  layer: ArchitectureLayerType;
  showConnector?: boolean;
}

export function ArchitectureLayer({
  layer,
  showConnector = false,
}: ArchitectureLayerProps) {
  return (
    <div className="relative">
      {showConnector && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-black"
          aria-hidden="true"
        />
      )}
      <div
        className={`${layer.color} border-2 border-black shadow-neo p-5 md:p-6`}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h3 className="font-heading font-bold text-lg md:text-xl">
            {layer.label}
          </h3>
          <div className="flex flex-wrap gap-2">
            {layer.items.map((item) => (
              <span
                key={item}
                className="text-xs font-mono bg-white/20 border border-current/20 px-3 py-1"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
