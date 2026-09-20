/** ຕໍ່ className ແບບງ່າຍ (NativeWind — ບໍ່ຕ້ອງ merge conflict ຄື web). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
