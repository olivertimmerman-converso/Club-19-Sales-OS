"use client";

import React, { useEffect } from "react";
import { useTrade } from "@/contexts/TradeContext";
import { WizardStep } from "@/lib/types/invoice";
import { RotateCcw } from "lucide-react";

const STEP_LABELS = ["Item Details", "Pricing & Suppliers", "Client & Payment", "Logistics & Tax", "Review & Create"];

const STEP_LABELS_SHORT = ["Item", "Price", "Client", "Tax", "Review"];

type WizardShellProps = {
  children: React.ReactNode;
};

export function WizardShell({ children }: WizardShellProps) {
  const { state, canGoNext, canGoPrev, nextStep, prevStep, goToStep, canGoToStep, resetWizard } = useTrade();
  const [showResetConfirm, setShowResetConfirm] = React.useState(false);

  // Scroll to top on step change
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [state.currentStep]);

  // Keyboard navigation: Enter to advance
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Only trigger if Enter is pressed and Next button is enabled
      if (event.key === "Enter" && canGoNext) {
        // Don't trigger if user is in a textarea or the target is a button/link
        const target = event.target as HTMLElement;
        if (
          target.tagName === "TEXTAREA" ||
          target.tagName === "BUTTON" ||
          target.tagName === "A"
        ) {
          return;
        }

        event.preventDefault();
        nextStep();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [canGoNext, nextStep]);

  const handleConfirmReset = () => {
    resetWizard();
    goToStep(0);
    setShowResetConfirm(false);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">New Sale</h1>
            <p className="text-gray-600 mt-1">Create a new sale record with Xero invoice</p>
          </div>
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RotateCcw size={16} />
            <span className="hidden sm:inline">Start Over</span>
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <nav className="mb-6" aria-label="Progress">
        <div className="flex items-center justify-between gap-1 sm:gap-2">
          {STEP_LABELS.map((label, index) => {
            const isCompleted = index < state.currentStep;
            const isCurrent = index === state.currentStep;
            const shortLabel = STEP_LABELS_SHORT[index];
            const canNavigate = canGoToStep(index as WizardStep);

            return (
              <React.Fragment key={label}>
                {/* Step Circle */}
                <div className="flex flex-1 flex-col items-center">
                  <button
                    type="button"
                    onClick={() => canNavigate && goToStep(index as WizardStep)}
                    disabled={!canNavigate}
                    className={`
                      flex h-8 w-8 min-w-[32px] items-center justify-center rounded-full border-2 text-xs font-semibold transition-all sm:h-10 sm:w-10 sm:text-sm
                      ${
                        isCompleted
                          ? "border-green-600 bg-green-600 text-white cursor-pointer hover:bg-green-700 hover:border-green-700"
                          : isCurrent
                            ? "border-gray-900 bg-white text-gray-900 shadow-lg cursor-default ring-2 ring-gray-900 ring-offset-2"
                            : canNavigate
                              ? "border-gray-300 bg-white text-gray-400 cursor-not-allowed opacity-60"
                              : "border-gray-300 bg-white text-gray-400 cursor-not-allowed opacity-40"
                      }
                    `}
                    aria-label={label}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    {isCompleted ? (
                      <svg
                        className="h-4 w-4 sm:h-5 sm:w-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </button>
                  <span
                    className={`
                      mt-1.5 text-[10px] font-medium sm:mt-2 sm:text-xs
                      ${isCurrent ? "text-gray-900" : isCompleted ? "text-gray-700" : "text-gray-400"}
                    `}
                  >
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{shortLabel}</span>
                  </span>
                </div>

                {/* Connector Line */}
                {index < STEP_LABELS.length - 1 && (
                  <div
                    className={`
                      -mt-6 h-0.5 w-full flex-1 transition-all sm:-mt-7
                      ${isCompleted ? "bg-green-600" : "bg-gray-300"}
                    `}
                    aria-hidden="true"
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </nav>

      {/* Error Message */}
      {state.error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                {state.error}
              </h3>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-200">
        <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>

        {/* Navigation Buttons */}
        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50/50 px-4 py-4 rounded-b-xl sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5 lg:px-8">
          {state.currentStep > 0 && (
            <button
              type="button"
              onClick={prevStep}
              disabled={!canGoPrev}
              className={`
                w-full rounded-lg px-5 py-2.5 text-sm font-medium transition-all sm:w-auto
                ${
                  canGoPrev
                    ? "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300 shadow-sm active:scale-95"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                }
              `}
            >
              Previous
            </button>
          )}

          <div className="hidden text-center text-sm font-light text-gray-500 sm:block">
            Step {state.currentStep + 1} of {STEP_LABELS.length}
          </div>

          <button
            type="button"
            onClick={nextStep}
            disabled={!canGoNext}
            className={`
              w-full rounded-lg px-6 py-2.5 text-sm font-medium transition-all sm:w-auto flex items-center justify-center gap-2
              ${
                canGoNext
                  ? "bg-gray-900 text-white hover:bg-gray-800 shadow-md active:scale-95"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }
            `}
          >
            {state.currentStep < STEP_LABELS.length - 1 ? (
              <>
                Next: {STEP_LABELS[state.currentStep + 1]}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </>
            ) : (
              "Review"
            )}
          </button>
        </div>
      </div>

      {/* Submission Status */}
      {state.isSubmitting && (
        <div className="mt-6 rounded-lg bg-gray-100 border border-gray-200 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 animate-spin text-gray-900"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">
                Creating invoice and logging sale...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Start over?
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              This will clear all progress and return you to the beginning.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
              >
                Start over
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
