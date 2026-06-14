import { Field as BaseField } from "@base-ui/react/field"
import type { ComponentProps } from "react"

import { cn } from "../lib/cn"

export function Field({ className, ...props }: ComponentProps<typeof BaseField.Root>) {
  return <BaseField.Root className={cn("space-y-2", className)} {...props} />
}

export function FieldLabel({ className, ...props }: ComponentProps<typeof BaseField.Label>) {
  return (
    <BaseField.Label
      className={cn("block text-sm font-medium text-foreground", className)}
      {...props}
    />
  )
}

export function FieldDescription({
  className,
  ...props
}: ComponentProps<typeof BaseField.Description>) {
  return (
    <BaseField.Description className={cn("text-xs leading-5 text-muted", className)} {...props} />
  )
}

export function FieldError({ className, ...props }: ComponentProps<typeof BaseField.Error>) {
  return <BaseField.Error className={cn("text-xs leading-5 text-red-200", className)} {...props} />
}
