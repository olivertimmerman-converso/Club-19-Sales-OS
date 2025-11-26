"use client";

import React from "react";
import { TradeProvider, useTrade } from "@/contexts/TradeContext";
import { WizardShell } from "@/components/trade/WizardShell";
import { StepDealLogistics } from "@/components/trade/StepDealLogistics";
import { StepItemsAndMargin } from "@/components/trade/StepItemsAndMargin";
import { StepBuyerAndReview } from "@/components/trade/StepBuyerAndReview";

function WizardContent() {
  const { state } = useTrade();

  // Render current step
  switch (state.currentStep) {
    case 0:
      return <StepDealLogistics />;
    case 1:
      return <StepItemsAndMargin />;
    case 2:
      return <StepBuyerAndReview />;
    default:
      return <StepDealLogistics />;
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
