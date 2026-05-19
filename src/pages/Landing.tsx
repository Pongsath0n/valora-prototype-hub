import Hero from "@/components/marketing/Hero";
import MarketingNav from "@/components/marketing/MarketingNav";
import PainPoints from "@/components/marketing/PainPoints";
import Solution from "@/components/marketing/Solution";
import Features from "@/components/marketing/Features";
import Workflow from "@/components/marketing/Workflow";
import UseCases from "@/components/marketing/UseCases";
import Phase1Transparency from "@/components/marketing/Phase1Transparency";
import FinalCTA from "@/components/marketing/FinalCTA";
import MarketingFooter from "@/components/marketing/MarketingFooter";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <main>
        <Hero />
        <PainPoints />
        <Solution />
        <Features />
        <Workflow />
        <UseCases />
        <Phase1Transparency />
        <FinalCTA />
      </main>
      <MarketingFooter />
    </div>
  );
}
