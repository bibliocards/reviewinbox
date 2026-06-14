import { Progress as BaseProgress } from "@base-ui/react/progress"
import type { ComponentProps } from "react"

import { cn } from "../lib/cn"

export type ProgressProps = ComponentProps<typeof BaseProgress.Root>

export function Progress({ className, value = 0, ...props }: ProgressProps) {
  const clampedValue = Math.max(0, Math.min(100, Number(value ?? 0)))

  return (
    <BaseProgress.Root
      value={clampedValue}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-surface-3", className)}
      {...props}
    >
      <BaseProgress.Indicator
        className="h-full bg-primary transition-transform motion-reduce:transition-none"
        style={{ transform: `translateX(-${100 - clampedValue}%)` }}
      />
    </BaseProgress.Root>
  )
}
