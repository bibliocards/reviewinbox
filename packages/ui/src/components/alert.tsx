import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "../lib/cn"

export const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-x-3 gap-y-0.5 rounded-xl border px-4 py-3 text-sm leading-6 has-[>svg]:grid-cols-[auto_1fr] [&>svg]:size-4 [&>svg]:translate-y-1 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "border-border bg-surface-1 text-muted-foreground",
        destructive: "border-destructive/40 bg-destructive/10 text-red-100",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export type AlertProps = ComponentProps<"div"> & VariantProps<typeof alertVariants>

export function Alert({ className, variant, role, ...props }: AlertProps) {
  return (
    <div
      data-slot="alert"
      role={role ?? (variant === "destructive" ? "alert" : "status")}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

export function AlertTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      data-slot="alert-title"
      className={cn("col-start-2 line-clamp-1 min-h-4 font-medium text-foreground", className)}
      {...props}
    />
  )
}

export function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 text-sm leading-6 [&_p]:leading-relaxed", className)}
      {...props}
    />
  )
}

export function AlertAction({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("col-start-2 mt-2 flex items-center gap-2", className)}
      {...props}
    />
  )
}
