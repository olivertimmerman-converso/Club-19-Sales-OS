"use client";

import React from "react";
import { TradeProvider, useTrade } from "@/contexts/TradeContext";
import { WizardShell } from "@/components/trade/WizardShell";
import { StepTaxScenario } from "@/components/trade/StepTaxScenario";
import { StepSupplierItems } from "@/components/trade/StepSupplierItems";
import { StepBuyer } from "@/components/trade/StepBuyer";
import { StepReview } from "@/components/trade/StepReview";

function WizardContent() {
  const { state } = useTrade();

  // Render current step
  switch (state.currentStep) {
    case 0:
      return <StepTaxScenario />;
    case 1:
      return <StepSupplierItems />;
    case 2:
      return <StepBuyer />;
    case 3:
      return <StepReview />;
    default:
      return <div>Unknown step</div>;
  }
}

export default function NewTradePage() {
  return (
    <TradeProvider>
      <WizardShell>
        <WizardContent />
      </WizardShell>
    </TradeProvider>
  );
}
