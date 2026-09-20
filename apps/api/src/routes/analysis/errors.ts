export function isUniqueViolation(error: Error): boolean {
  return 'code' in error && error.code === '23505'
}
