import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "border-white/12 bg-white/[0.03] text-foreground",
        emerald: "border-primary/35 bg-primary/15 text-primary",
        cyan: "border-cyan/35 bg-cyan/15 text-cyan",
        amber: "border-amber/40 bg-amber/15 text-amber",
        danger: "border-danger/35 bg-danger/15 text-danger",
        muted: "border-white/8 bg-white/[0.02] text-secondaryText",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
