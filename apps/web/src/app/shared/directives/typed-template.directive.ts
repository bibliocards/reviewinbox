import { Directive, Input } from '@angular/core'

export interface TypedTemplateContext<T> {
  $implicit: T
}

@Directive({
  selector: 'ng-template[typedTemplate]',
})
export class TypedTemplateDirective<T> {
  @Input('typedTemplate')
  value!: T | readonly T[] | null | undefined

  static ngTemplateContextGuard<T>(
    _directive: TypedTemplateDirective<T>,
    _context: unknown,
  ): _context is TypedTemplateContext<InferTemplateType<T>> {
    return true
  }
}

type InferTemplateType<T> = T extends readonly (infer U)[] ? U : NonNullable<T>
