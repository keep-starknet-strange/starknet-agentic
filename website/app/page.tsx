import { Navbar } from "./components/Navbar/Navbar";
import { Hero } from "./components/Hero/Hero";
import { MarqueeBanner } from "./components/sections/MarqueeBanner";
import { WhyStarknet } from "./components/sections/WhyStarknet";
import { Vision } from "./components/sections/Vision";
import { FeaturedApps } from "./components/sections/FeaturedApps";
import { Architecture } from "./components/sections/Architecture";
import { GetStarted } from "./components/sections/GetStarted";
import { Footer } from "./components/sections/Footer";

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <Navbar />
      <Hero />
      <MarqueeBanner />
      <WhyStarknet />
      <Vision />
      <FeaturedApps />
      <Architecture />
      <GetStarted />
      <Footer />
    </main>
  );
}
