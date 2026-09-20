import type { Customer } from '@/types/models';

import { normaliseKey } from './parseCsv';

/** The customer fields the importer can set on create. */
export type CustomerFieldKey = 'name' | 'phone' | 'email' | 'gender' | 'birthDate' | 'notes';

export interface ImportFieldSpec {
  key: CustomerFieldKey;
  /** i18n key under `importExport.field.customers.<key>`. */
  labelKey: string;
  required?: boolean;
  /** Header aliases (already normalised) that auto-map to this field. */
  aliases: string[];
}

/** Target shape for the customer importer — the subset we let people set on create. */
export const CUSTOMER_IMPORT_FIELDS: ImportFieldSpec[] = [
  { key: 'name', labelKey: 'name', required: true, aliases: ['name', 'fullname', 'customername', 'ຊື', 'ຊື່'] },
  { key: 'phone', labelKey: 'phone', required: true, aliases: ['phone', 'phonenumber', 'mobile', 'tel', 'ເບີໂທ', 'ໂທ'] },
  { key: 'email', labelKey: 'email', aliases: ['email', 'mail', 'emailaddress', 'ອີເມວ'] },
  { key: 'gender', labelKey: 'gender', aliases: ['gender', 'sex', 'ເພດ'] },
  { key: 'birthDate', labelKey: 'birthDate', aliases: ['birthdate', 'birthday', 'dob', 'ວັນເກີດ'] },
  { key: 'notes', labelKey: 'notes', aliases: ['notes', 'note', 'remark', 'ໝາຍເຫດ'] },
];

export type ColumnMap = Record<string, number | null>; // field key -> source column index

/** Best-guess mapping from detected headers to target fields. */
export function autoMap(headers: string[]): ColumnMap {
  const norm = headers.map(normaliseKey);
  const map: ColumnMap = {};
  for (const field of CUSTOMER_IMPORT_FIELDS) {
    const idx = norm.findIndex((h) => field.aliases.includes(h));
    map[field.key] = idx === -1 ? null : idx;
  }
  return map;
}

export type RowStatus = 'new' | 'duplicate' | 'error';

export interface ReviewRow {
  /** 1-based source row number (excludes the header). */
  line: number;
  values: Record<CustomerFieldKey, string>;
  status: RowStatus;
  /** i18n keys under `importExport.err.*`, already resolved to text. */
  errors: string[];
}

const PHONE_RE = /^[+]?[\d\s()-]{6,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENDERS = new Set(['MALE', 'FEMALE', 'OTHER']);

interface ValidateArgs {
  rows: string[][];
  map: ColumnMap;
  existing: Pick<Customer, 'phone'>[];
  t: (key: string, opts?: Record<string, unknown>) => string;
}

/** Turn mapped CSV rows into a reviewable, validated list. */
export function buildReview({ rows, map, existing, t }: ValidateArgs): ReviewRow[] {
  const existingPhones = new Set(existing.map((c) => normalisePhone(c.phone)));
  const seenInFile = new Set<string>();

  return rows.map((cells, i) => {
    const values = {} as Record<CustomerFieldKey, string>;
    for (const field of CUSTOMER_IMPORT_FIELDS) {
      const col = map[field.key];
      values[field.key] = col == null ? '' : (cells[col] ?? '').trim();
    }

    const errors: string[] = [];
    if (!values.name) errors.push(t('importExport.err.nameRequired'));
    if (!values.phone) {
      errors.push(t('importExport.err.phoneRequired'));
    } else if (!PHONE_RE.test(values.phone)) {
      errors.push(t('importExport.err.phoneInvalid'));
    }
    if (values.email && !EMAIL_RE.test(values.email)) {
      errors.push(t('importExport.err.emailInvalid'));
    }
    if (values.gender && !GENDERS.has(values.gender.toUpperCase())) {
      errors.push(t('importExport.err.genderInvalid'));
    }

    let status: RowStatus = 'new';
    if (errors.length > 0) {
      status = 'error';
    } else {
      const phoneKey = normalisePhone(values.phone);
      if (existingPhones.has(phoneKey) || seenInFile.has(phoneKey)) {
        status = 'duplicate';
      }
      seenInFile.add(phoneKey);
    }

    return { line: i + 1, values, status, errors };
  });
}

function normalisePhone(p: string): string {
  return p.replace(/[^\d]/g, '');
}

/** Shape a validated row into the create payload. */
export function toCreatePayload(row: ReviewRow): Partial<Customer> {
  const v = row.values;
  return {
    name: v.name,
    phone: v.phone,
    email: v.email || null,
    gender: v.gender ? (v.gender.toUpperCase() as Customer['gender']) : null,
    birthDate: v.birthDate || null,
    notes: v.notes || null,
  };
}

export const CUSTOMER_TEMPLATE_HEADERS = CUSTOMER_IMPORT_FIELDS.map((f) => f.key);
export const CUSTOMER_TEMPLATE_SAMPLE = [
  ['Dara Vong', '2028810001', 'dara@mail.test', 'FEMALE', '1994-05-12', 'VIP referral'],
  ['Somchai Keo', '2029990002', '', 'MALE', '', ''],
];
