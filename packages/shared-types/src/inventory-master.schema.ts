import { z } from 'zod';

/**
 * Inventory audit ຄື້ນ 9C — ຂໍ້ມູນຫຼັກຂອງສິນຄ້າ:
 *  - M1 ໜ່ວຍນັບ (Uom) + ອັດຕາແປງຕໍ່ສິນຄ້າ (1 ໜ່ວຍ = factorToBase × ໜ່ວຍພື້ນຖານ)
 *  - M2 barcode / GTIN (GS1 check digit)
 *  - M3 ໝວດສິນຄ້າ + ABC analysis
 */

// ---- M2 — GTIN -----------------------------------------------------

/** ຄວາມຍາວ GTIN ທີ່ GS1 ຮອງຮັບ (GTIN-8 / UPC-A 12 / EAN-13 / GTIN-14). */
export const GTIN_LENGTHS = [8, 12, 13, 14] as const;

/**
 * GS1 mod-10 check digit: ນັບຈາກຂວາ (ບໍ່ລວມຕົວກວດ) ນ້ຳໜັກ 3,1,3,1… ; ຕົວກວດ = (10 − Σ mod 10) mod 10.
 */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = body.length - 1, w = 3; i >= 0; i -= 1, w = w === 3 ? 1 : 3)
    sum += Number(body[i]) * w;
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || !(GTIN_LENGTHS as readonly number[]).includes(code.length))
    return false;
  return gtinCheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

export const gtinSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, 'GTIN ຕ້ອງເປັນຕົວເລກເທົ່ານັ້ນ')
  .refine(
    (v) => (GTIN_LENGTHS as readonly number[]).includes(v.length),
    'GTIN ຕ້ອງຍາວ 8, 12, 13 ຫຼື 14 ຕົວ',
  )
  .refine(
    (v) => !(GTIN_LENGTHS as readonly number[]).includes(v.length) || isValidGtin(v),
    'GTIN check digit ບໍ່ຖືກຕ້ອງ',
  );

/** ລະຫັດ barcode ພາຍໃນ (ອິດສະຫຼະ — ບໍ່ມີຍະຫວ່າງ). */
export const barcodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^\S+$/, 'barcode ຕ້ອງບໍ່ມີຍະຫວ່າງ');

export const productLookupQuerySchema = z.object({
  code: z.string().trim().min(1).max(64),
  branchId: z.string().uuid().optional(),
});
export type ProductLookupQuery = z.infer<typeof productLookupQuerySchema>;

export type ProductLookupMatch = 'gtin' | 'barcode' | 'sku';

// ---- M1 — Units of measure -------------------------------------------

export const uomWriteSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .transform((v) => v.toLowerCase()),
  name: z.string().trim().min(1).max(60),
  nameLo: z.string().trim().max(60).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UomWriteInput = z.infer<typeof uomWriteSchema>;
export const uomUpdateSchema = uomWriteSchema.partial();
export type UomUpdateInput = z.infer<typeof uomUpdateSchema>;

export const uomListQuerySchema = z.object({
  includeInactive: z.enum(['true', 'false']).optional(),
});
export type UomListQuery = z.infer<typeof uomListQuerySchema>;

export type UomView = {
  id: string;
  code: string;
  name: string;
  nameLo: string | null;
  isActive: boolean;
  /** ຈຳນວນສິນຄ້າທີ່ໃຊ້ເປັນໜ່ວຍພື້ນຖານ. */
  productCount: number;
};

/** ອັດຕາແປງ 1 ໜ່ວຍ = factorToBase × ໜ່ວຍພື້ນຖານ (ເຊັ່ນ box = 12, ml = 0.002 ສຳລັບຕຸກ 500 ml). */
export const productUomConversionInputSchema = z.object({
  uomId: z.string().uuid(),
  factorToBase: z.coerce.number().positive().max(1_000_000),
  isPurchaseDefault: z.boolean().default(false),
  isConsumeDefault: z.boolean().default(false),
});
export type ProductUomConversionInput = z.infer<typeof productUomConversionInputSchema>;

export const productUomConversionsSchema = z
  .array(productUomConversionInputSchema)
  .max(20)
  .refine(
    (rows) => new Set(rows.map((r) => r.uomId)).size === rows.length,
    'ມີໜ່ວຍຊ້ຳກັນໃນອັດຕາແປງ',
  )
  .refine(
    (rows) => rows.filter((r) => r.isPurchaseDefault).length <= 1,
    'ໜ່ວຍຊື້ເລີ່ມຕົ້ນໄດ້ສະເພາະ 1 ອັນ',
  )
  .refine(
    (rows) => rows.filter((r) => r.isConsumeDefault).length <= 1,
    'ໜ່ວຍໃຊ້ BOM ເລີ່ມຕົ້ນໄດ້ສະເພາະ 1 ອັນ',
  );

export type ProductUomConversionView = {
  uomId: string;
  code: string;
  name: string;
  nameLo: string | null;
  factorToBase: number;
  isPurchaseDefault: boolean;
  isConsumeDefault: boolean;
};

// ---- M3 — Product categories --------------------------------------------

export const productCategoryWriteSchema = z.object({
  name: z.string().trim().min(1).max(80),
  nameLo: z.string().trim().max(80).nullable().optional(),
  /** ຊ້ອນໄດ້ 1 ຊັ້ນ (parent ຕ້ອງເປັນໝວດຫຼັກ). */
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
  /** null = ໃຊ້ຮ່ວມທົ່ວອົງກອນ (SUPER_ADMIN ເທົ່ານັ້ນ). */
  branchId: z.string().uuid().nullable().optional(),
});
export type ProductCategoryWriteInput = z.infer<typeof productCategoryWriteSchema>;
export const productCategoryUpdateSchema = productCategoryWriteSchema.partial();
export type ProductCategoryUpdateInput = z.infer<typeof productCategoryUpdateSchema>;

export const productCategoryListQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  includeInactive: z.enum(['true', 'false']).optional(),
});
export type ProductCategoryListQuery = z.infer<typeof productCategoryListQuerySchema>;

export type ProductCategoryView = {
  id: string;
  name: string;
  nameLo: string | null;
  parentId: string | null;
  parentName: string | null;
  sortOrder: number;
  isActive: boolean;
  branchId: string | null;
  branchName: string | null;
  productCount: number;
};

/** ລາຍງານ valuation / turnover / aging: ຈັດກຸ່ມຕາມສິນຄ້າ (default) ຫຼື ໝວດ. */
export const inventoryReportGroupBySchema = z.enum(['product', 'category']);
export type InventoryReportGroupBy = z.infer<typeof inventoryReportGroupBySchema>;

// ---- M3 — ABC analysis ------------------------------------------------------

export const ABC_CLASSES = ['A', 'B', 'C'] as const;
export type AbcClass = (typeof ABC_CLASSES)[number];

export const abcBasisSchema = z.enum(['consumptionValue', 'stockValue']);
export type AbcBasis = z.infer<typeof abcBasisSchema>;

export const abcQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  /** YYYY-MM-DD (ວັນວຽງຈັນ) — ໃຊ້ກັບ basis=consumptionValue. ບໍ່ໃສ່ = 30 ວັນຫຼ້າສຸດ. */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  basis: abcBasisSchema.default('consumptionValue'),
});
export type AbcQuery = z.infer<typeof abcQuerySchema>;

export type AbcRow = {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  branchName: string;
  categoryName: string | null;
  value: number;
  /** % ຂອງມູນຄ່າລວມ. */
  sharePct: number;
  /** % ສະສົມ (ລວມແຖວນີ້) ຫຼັງລຽງມູນຄ່າຈາກຫຼາຍຫານ້ອຍ. */
  cumulativePct: number;
  abcClass: AbcClass;
};

export type AbcView = {
  basis: AbcBasis;
  from: string | null;
  to: string | null;
  branchId: string | null;
  thresholds: { a: number; b: number };
  rows: AbcRow[];
  classes: { abcClass: AbcClass; products: number; value: number; sharePct: number }[];
  totals: { products: number; value: number };
};
