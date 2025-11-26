"use client";

import React from "react";
import { TradeProvider, useTrade } from "@/contexts/TradeContext";
import { WizardShell } from "@/components/trade/WizardShell";
import { StepDealLogistics } from "@/components/trade/StepDealLogistics";
import { StepItemsAndMargin } from "@/components/trade/StepItemsAndMargin";
import { StepBuyerAndReview } from "@/components/trade/StepBuyerAndReview";

function WizardContent() {
  const { state, resetKey } = useTrade();

  return (
    <div className="w-full" key={resetKey}>
      {/* Step 0: Deal & Logistics */}
      <div className={state.currentStep === 0 ? "block w-full" : "hidden w-full"}>
        <StepDealLogistics />
      </div>

      {/* Step 1: Items & Pricing */}
      <div className={state.currentStep === 1 ? "block w-full" : "hidden w-full"}>
        <StepItemsAndMargin />
      </div>

      {/* Step 2: Buyer & Review */}
      <div className={state.currentStep === 2 ? "block w-full" : "hidden w-full"}>
        <StepBuyerAndReview />
      </div>
    </div>
  );
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
