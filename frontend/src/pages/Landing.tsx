import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingHero from "@/components/landing/LandingHero";
import PainPointsSection from "@/components/landing/PainPointsSection";
import CostProfitSection from "@/components/landing/CostProfitSection";
import FeatureGrid from "@/components/landing/FeatureGrid";
import SolutionSection from "@/components/landing/SolutionSection";
import ProductSnapshots from "@/components/landing/ProductSnapshots";
import UseCasesSection from "@/components/landing/UseCasesSection";
import PhaseOneSection from "@/components/landing/PhaseOneSection";
import LandingCTA from "@/components/landing/LandingCTA";
import LandingFooter from "@/components/landing/LandingFooter";

// Valora V.1 public landing page.
// Positioning: a friendly Profit Planning / decision-support tool for small
// cafes and SMEs -- NOT accounting, payroll, or full ERP. Profit Planning is
// the core; order/payment review and LINE OA are supporting features.
// Flow: Hero, Pain Points, Profit Planning Core, Feature Highlights,
// How It Works, Product Preview, Who It Is For, V.1 Scope, Final CTA.
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main id="main">
        <LandingHero />
        <PainPointsSection />
        <CostProfitSection />
        <FeatureGrid />
        <SolutionSection />
        <ProductSnapshots />
        <UseCasesSection />
        <PhaseOneSection />
        <LandingCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
