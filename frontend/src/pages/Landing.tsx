import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingHero from "@/components/landing/LandingHero";
import PainPointsSection from "@/components/landing/PainPointsSection";
import SolutionSection from "@/components/landing/SolutionSection";
import VerifiedWorkflowSection from "@/components/landing/VerifiedWorkflowSection";
import ProductSnapshots from "@/components/landing/ProductSnapshots";
import FeatureGrid from "@/components/landing/FeatureGrid";
import RoleValueSection from "@/components/landing/RoleValueSection";
import CostProfitSection from "@/components/landing/CostProfitSection";
import UseCasesSection from "@/components/landing/UseCasesSection";
import TrustReadinessSection from "@/components/landing/TrustReadinessSection";
import PhaseOneSection from "@/components/landing/PhaseOneSection";
import LandingCTA from "@/components/landing/LandingCTA";
import LandingFooter from "@/components/landing/LandingFooter";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main id="main">
        <LandingHero />
        <PainPointsSection />
        <SolutionSection />
        <VerifiedWorkflowSection />
        <ProductSnapshots />
        <FeatureGrid />
        <RoleValueSection />
        <CostProfitSection />
        <UseCasesSection />
        <TrustReadinessSection />
        <PhaseOneSection />
        <LandingCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
