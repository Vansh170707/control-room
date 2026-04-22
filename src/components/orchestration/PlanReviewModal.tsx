import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PlanReviewRequest } from "@/lib/orchestration";

export function PlanReviewModal({
  review,
  open,
  onApprove,
  onReject,
}: {
  review: PlanReviewRequest | null;
  open: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onReject()}>
      <DialogContent className="max-w-2xl border border-[#30363d] bg-[#0d1117] text-[#c9d1d9]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#e6edf3]">
            Plan Review Required
          </DialogTitle>
          <DialogDescription className="text-[#8b949e]">
            Strategic or risky work pauses here so you can review the execution plan first.
          </DialogDescription>
        </DialogHeader>
        {review ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={review.riskLevel === "danger" ? "danger" : review.riskLevel === "caution" ? "amber" : "muted"}>
                  {review.riskLevel}
                </Badge>
                <Badge variant="cyan">{review.title}</Badge>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-[#c9d1d9]">
                {review.objective}
              </p>
            </div>

            <div className="rounded-lg border border-[#30363d] bg-[#0b0f15] p-3">
              <p className="mb-2 text-[11px] uppercase tracking-wider text-[#8b949e]">
                Steps
              </p>
              <div className="space-y-2">
                {review.steps.map((step, index) => (
                  <div key={step.id} className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
                    <p className="text-[12px] font-medium text-[#e6edf3]">
                      {index + 1}. {step.title}
                    </p>
                    <p className="mt-1 text-[11px] text-[#8b949e]">{step.outcome}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-3">
              <p className="mb-2 text-[11px] uppercase tracking-wider text-[#8b949e]">
                Risk Assessment
              </p>
              <div className="space-y-1.5">
                {review.riskAssessment.map((risk, index) => (
                  <div key={`${review.id}-${index}`} className="flex items-start gap-2 text-[13px] text-[#fcd34d]">
                    <span className="mt-1">•</span>
                    <span>{risk}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onReject} className="text-[#f87171] hover:bg-[#3f191f]/30 hover:text-[#fca5a5]">
                Reject
              </Button>
              <Button variant="secondary" size="sm" onClick={onApprove}>
                Approve Plan
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
