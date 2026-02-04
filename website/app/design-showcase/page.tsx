import DesignPreview1 from "./previews/NeoBrutalist";
import DesignPreview2 from "./previews/MinimalDark";
import DesignPreview3 from "./previews/Glassmorphism";
import DesignPreview4 from "./previews/CyberpunkNeon";
import DesignPreview5 from "./previews/OrganicFlow";
import DesignPreview6 from "./previews/BentoGrid";
import DesignPreview7 from "./previews/TerminalHacker";
import DesignPreview8 from "./previews/GradientMesh";
import DesignPreview9 from "./previews/Neumorphism";
import DesignPreview10 from "./previews/SwissDesign";
import DesignPreview11 from "./previews/MemphisDesign";
import DesignPreview12 from "./previews/RetroFuturism";
import DesignPreview13 from "./previews/Claymorphism";
import DesignPreview14 from "./previews/CyberpunkNetStyle";
import DesignPreview15 from "./previews/OpenClawStyle";
import DesignPreview16 from "./previews/StarknetOfficialStyle";
import DesignPreview17 from "./previews/GitHubStyle";
import DesignPreview18 from "./previews/AITechCyberpunk";

const designs = [
  {
    id: 1,
    name: "Neo-Brutalist",
    description:
      "Bold borders, offset shadows, vibrant colors. High-energy, unapologetic aesthetic.",
    component: DesignPreview1,
  },
  {
    id: 2,
    name: "Minimal Dark",
    description:
      "Clean dark mode with subtle gradients. Sophisticated and professional.",
    component: DesignPreview2,
  },
  {
    id: 3,
    name: "Glassmorphism",
    description:
      "Frosted glass effects and translucent layers. Modern depth through blur.",
    component: DesignPreview3,
  },
  {
    id: 4,
    name: "Cyberpunk Neon",
    description:
      "Neon glows on dark backgrounds. Futuristic with glitch effects.",
    component: DesignPreview4,
  },
  {
    id: 5,
    name: "Organic Flow",
    description:
      "Curved shapes and gradient blobs. Friendly and approachable.",
    component: DesignPreview5,
  },
  {
    id: 6,
    name: "Bento Grid",
    description:
      "Apple-style asymmetric grid. Structured yet dynamic.",
    component: DesignPreview6,
  },
  {
    id: 7,
    name: "Terminal Hacker",
    description:
      "Monospace fonts, green-on-black. Developer-focused aesthetic.",
    component: DesignPreview7,
  },
  {
    id: 8,
    name: "Gradient Mesh",
    description:
      "Soft pastels and fluid shapes. Dreamy and artistic.",
    component: DesignPreview8,
  },
  {
    id: 9,
    name: "Neumorphism",
    description:
      "Soft UI with extruded and inset shadows. Soothing, minimal contrast.",
    component: DesignPreview9,
  },
  {
    id: 10,
    name: "Swiss Design",
    description:
      "Grid-based, bold typography, mathematical precision. Helvetica vibes.",
    component: DesignPreview10,
  },
  {
    id: 11,
    name: "Memphis Design",
    description:
      "80s geometric chaos. Squiggles, bold colors, playful maximalism.",
    component: DesignPreview11,
  },
  {
    id: 12,
    name: "Retro Futurism",
    description:
      "70s/80s sci-fi aesthetic. Synthwave sunsets, chrome, perspective grids.",
    component: DesignPreview12,
  },
  {
    id: 13,
    name: "Claymorphism",
    description:
      "Soft 3D clay aesthetic. Puffy shapes, pastels, toy-like feel.",
    component: DesignPreview13,
  },
  {
    id: 14,
    name: "Cyberpunk.net Style",
    description:
      "CD Projekt RED inspired. Neon yellow on deep black, stark contrast, cinematic minimalism.",
    component: DesignPreview14,
  },
  {
    id: 15,
    name: "OpenClaw Style",
    description:
      "Deep navy with coral/cyan glows. Futuristic yet approachable, asymmetric cards.",
    component: DesignPreview15,
  },
  {
    id: 16,
    name: "Starknet Official Style",
    description:
      "Light minimalist, monospace code, pill buttons. Professional and premium.",
    component: DesignPreview16,
  },
  {
    id: 17,
    name: "GitHub Style",
    description:
      "Clean light background, green CTAs, card-based. Developer-friendly, trustworthy.",
    component: DesignPreview17,
  },
  {
    id: 18,
    name: "AI Tech Cyberpunk",
    description:
      "Neural network patterns, gradient glows. Futuristic AI aesthetic, intelligent vibe.",
    component: DesignPreview18,
  },
];

export default function DesignShowcase() {
  return (
    <main className="min-h-screen bg-neutral-100">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-6 py-12 md:px-12">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm text-neutral-500 uppercase tracking-wider mb-3">
            Starknet Agentic
          </p>
          <h1 className="text-3xl md:text-4xl font-light text-neutral-900 mb-4">
            Design Direction Showcase
          </h1>
          <p className="text-neutral-500 max-w-lg mx-auto">
            18 design directions for the website. Review each preview and share
            your feedback with the community.
          </p>
        </div>
      </header>

      {/* Design Previews */}
      <div className="py-12 md:py-16 space-y-12 md:space-y-16">
        {designs.map((design) => (
          <section key={design.id} className="px-6 md:px-12">
            <div className="max-w-6xl mx-auto">
              {/* Design Label */}
              <div className="flex items-baseline gap-4 mb-4">
                <span className="text-sm text-neutral-400 tabular-nums">
                  {String(design.id).padStart(2, "0")}
                </span>
                <h2 className="text-lg font-medium text-neutral-900">
                  {design.name}
                </h2>
                <span className="text-sm text-neutral-400">
                  {design.description}
                </span>
              </div>

              {/* Preview Container */}
              <div className="rounded-lg overflow-hidden shadow-sm ring-1 ring-neutral-200">
                <div className="h-[350px] md:h-[400px] overflow-hidden">
                  <design.component />
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-neutral-200 px-6 py-10 md:px-12">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-neutral-600 mb-2">
            Which direction resonates with you?
          </p>
          <p className="text-sm text-neutral-400">
            Share your thoughts in the community discussion.
          </p>
        </div>
      </footer>
    </main>
  );
}
