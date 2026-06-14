import type { ComponentProps } from "react"

import { cn } from "../lib/cn"

export type TextareaProps = ComponentProps<"textarea">

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "flex min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground outline-none transition placeholder:text-muted focus:border-primary/70 focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive/60 md:text-sm",
        className,
      )}
      data-slot="textarea"
      {...props}
    />
  )
}
