import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingHero from "@/components/landing/LandingHero";
import PainPointsSection from "@/components/landing/PainPointsSection";
import SolutionSection from "@/components/landing/SolutionSection";
import FeatureGrid from "@/components/landing/FeatureGrid";
import WorkflowSection from "@/components/landing/WorkflowSection";
import UseCasesSection from "@/components/landing/UseCasesSection";
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
        <FeatureGrid />
        <WorkflowSection />
        <UseCasesSection />
        <PhaseOneSection />
        <LandingCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
