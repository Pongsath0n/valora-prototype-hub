/**
 * Internal sentinel used to represent empty-string business values inside
 * Radix Select. Radix reserves `""` for clearing selection / showing the
 * placeholder, so a SelectItem with `value=""` throws at render time.
 *
 * The sentinel is NEVER exposed to application code:
 * - onValueChange always receives the original business value ("")
 * - The sentinel never appears in form state, API payloads, or URLs
 */
export const EMPTY_OPTION_VALUE = "__FORM_SELECT_EMPTY__";

/**
 * Maps a business value to the internal value Radix receives.
 * Empty string becomes the sentinel; everything else passes through.
 */
export function toRadixValue(value: string): string {
  return value === "" ? EMPTY_OPTION_VALUE : value;
}

/**
 * Maps the internal Radix value back to the business value.
 * The sentinel becomes empty string; everything else passes through.
 */
export function fromRadixValue(value: string): string {
  return value === EMPTY_OPTION_VALUE ? "" : value;
}
