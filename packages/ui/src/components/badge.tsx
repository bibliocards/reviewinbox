import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentPropsWithRef } from "react"

import { cn } from "../lib/cn"

export const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&_[data-icon=inline-end]]:-mr-0.5 [&_[data-icon=inline-end]]:size-3 [&_[data-icon=inline-start]]:-ml-0.5 [&_[data-icon=inline-start]]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-border bg-surface-2 text-muted-foreground",
        destructive: "border-destructive/40 bg-destructive/10 text-red-200",
        outline: "border-border text-muted-foreground",
        ghost: "border-transparent text-muted-foreground",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export type BadgeProps = ComponentPropsWithRef<"span"> &
  VariantProps<typeof badgeVariants> & {
    render?: useRender.ComponentProps<"span">["render"]
  }

export function Badge({ className, variant, render, ref, ...props }: BadgeProps) {
  return useRender({
    ref,
    render,
    defaultTagName: "span",
    props: {
      "data-slot": "badge",
      className: cn(badgeVariants({ variant }), className),
      ...props,
    },
  })
}
