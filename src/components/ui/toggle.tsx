import * as TogglePrimitive from "@radix-ui/react-toggle";
import * as React from "react";
import { cn } from "@/lib/utils";

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root>
>(({ className, ...props }, ref) => (
  <TogglePrimitive.Root
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-secondaryText transition hover:bg-white/[0.06] hover:text-foreground data-[state=on]:border-primary/35 data-[state=on]:bg-primary/15 data-[state=on]:text-primary",
      className,
      props.disabled && "pointer-events-none opacity-50",
    )}
    {...props}
  />
));
Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle };
