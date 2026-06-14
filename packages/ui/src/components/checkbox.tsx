import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox"
import type { ComponentProps } from "react"

import { cn } from "../lib/cn"

export type CheckboxProps = ComponentProps<typeof BaseCheckbox.Root>

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <BaseCheckbox.Root
      className={cn(
        "grid size-5 place-items-center rounded border border-border bg-background text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60 data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <BaseCheckbox.Indicator aria-hidden="true" className="text-[11px] leading-none">
        ✓
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  )
}
