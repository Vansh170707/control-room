import React from "react";
import { Badge } from "@/components/ui/badge";
import type { VerifierReview } from "@/lib/orchestration";

export function VerifierPanel({
  reviews,
  selectedAgentId,
}: {
  reviews: VerifierReview[];
  selectedAgentId?: string | null;
}) {
  const visible = selectedAgentId
    ? reviews.filter((review) => review.agentId === selectedAgentId)
    : reviews;

  return (
    <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
      <div className="border-b border-[#1e252e] px-4 py-3">
        <p className="text-sm font-semibold text-[#e2e8f0]">Verifier Loop</p>
        <p className="text-[12px] text-[#8b949e]">
          Recent critic passes and bounded correction loops.
        </p>
      </div>
      <div className="divide-y divide-[#1e252e]">
        {visible.length > 0 ? (
          visible.slice(0, 8).map((review) => (
            <div key={review.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium text-[#e2e8f0]">
                    {review.agentId}
                  </p>
                  <p className="mt-1 text-[11px] text-[#6e7681]">
                    attempts {review.attempts}
                  </p>
                </div>
                <Badge
                  variant={review.verdict === "approved" ? "emerald" : "danger"}
                >
                  {review.verdict}
                </Badge>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-[#8b949e]">
                {review.feedback}
              </p>
              <p className="mt-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] text-[#6e7f93]">
                {review.candidatePreview}
              </p>
            </div>
          ))
        ) : (
          <div className="px-4 py-6 text-[12px] text-[#6e7681]">
            No verifier reviews yet.
          </div>
        )}
      </div>
    </div>
  );
}
