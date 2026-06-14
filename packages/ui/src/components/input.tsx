import { Input as BaseInput } from "@base-ui/react/input"
import type { ComponentProps } from "react"

import { cn } from "../lib/cn"

export type InputProps = ComponentProps<typeof BaseInput>

export function Input({ className, ...props }: InputProps) {
  return (
    <BaseInput
      className={cn(
        "flex min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary/70 focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  )
}
