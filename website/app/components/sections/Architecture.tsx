import { ARCHITECTURE_LAYERS, STANDARDS } from "@/data/architecture";
import { ArchitectureLayer } from "@/components/ui/ArchitectureLayer";
import { StandardCard } from "@/components/ui/StandardCard";

export function Architecture() {
  return (
    <section
      id="architecture"
      className="section-padding bg-white border-y-2 border-black"
    >
      <div className="max-w-5xl mx-auto">
        <div className="mb-16 text-center">
          <span className="neo-badge bg-neo-green mb-4 inline-block">
            The Stack
          </span>
          <h2 className="font-heading font-black text-4xl md:text-5xl lg:text-6xl mb-4">
            Five Layers of
            <br />
            Agent Infrastructure
          </h2>
          <p className="font-body text-lg text-neo-dark/70 max-w-2xl mx-auto">
            From AI platforms down to provable compute. Each layer is composable,
            open, and standards-based.
          </p>
        </div>

        <div className="space-y-3">
          {ARCHITECTURE_LAYERS.map((layer, i) => (
            <ArchitectureLayer
              key={layer.label}
              layer={layer}
              showConnector={i > 0}
            />
          ))}
        </div>

        {/* Standards */}
        <div className="mt-16">
          <h3 className="font-heading font-bold text-2xl mb-6 text-center">
            Built on Open Standards
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STANDARDS.map((standard) => (
              <StandardCard key={standard.name} standard={standard} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
