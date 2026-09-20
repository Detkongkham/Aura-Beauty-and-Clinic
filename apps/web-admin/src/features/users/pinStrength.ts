/** Flags PINs that are trivially guessable: all-same digit, or a run in ascending/descending order. */
export function isWeakPin(pin: string): boolean {
  if (pin.length < 4) return false;
  if (new Set(pin).size === 1) return true;

  let ascending = true;
  let descending = true;
  for (let i = 1; i < pin.length; i++) {
    const diff = Number(pin[i]) - Number(pin[i - 1]);
    if (diff !== 1) ascending = false;
    if (diff !== -1) descending = false;
  }
  return ascending || descending;
}
