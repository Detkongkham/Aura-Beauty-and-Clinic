import { describe, expect, it } from 'vitest';
import { timeStringSchema } from '../common.schema.js';
import { registerSchema, phoneSchema } from '../auth.schema.js';
import { createServiceSchema } from '../service.schema.js';
import { createPricingRuleSchema } from '../pricing.schema.js';

describe('timeStringSchema', () => {
  it('ຮັບ "09:00" ແລະ "23:59"', () => {
    expect(timeStringSchema.parse('09:00')).toBe('09:00');
    expect(timeStringSchema.parse('23:59')).toBe('23:59');
  });

  it('ປະຕິເສດຄ່າຜິດຮູບແບບ', () => {
    expect(() => timeStringSchema.parse('9:00')).toThrow();
    expect(() => timeStringSchema.parse('24:00')).toThrow();
    expect(() => timeStringSchema.parse('09:60')).toThrow();
  });
});

describe('phoneSchema', () => {
  it('ຮັບເບີລາວ ແລະ ເບີ +', () => {
    expect(phoneSchema.parse('02055512345')).toBe('02055512345');
    expect(phoneSchema.parse('+8562055512345')).toBe('+8562055512345');
  });

  it('ປະຕິເສດເບີສັ້ນ ຫຼື ມີຕົວອັກສອນ', () => {
    expect(() => phoneSchema.parse('12345')).toThrow();
    expect(() => phoneSchema.parse('020-555-1234')).toThrow();
  });
});

describe('registerSchema', () => {
  it('ຕ້ອງການ password ຢ່າງໜ້ອຍ 8 ຕົວ', () => {
    const base = { name: 'ນາງ ດາວ', phone: '02055512345' };
    expect(() => registerSchema.parse({ ...base, password: 'short' })).toThrow();
    expect(registerSchema.parse({ ...base, password: 'longenough1' }).name).toBe('ນາງ ດາວ');
  });
});

describe('createServiceSchema', () => {
  it('durationMinutes ຕ້ອງເປັນຕົວຄູນຂອງ 5', () => {
    const base = {
      categoryId: '00000000-0000-0000-0000-000000000001',
      name: 'ຕັດຜົມ',
      price: 120000,
    };
    expect(() => createServiceSchema.parse({ ...base, durationMinutes: 47 })).toThrow();
    expect(createServiceSchema.parse({ ...base, durationMinutes: 45 }).consumables).toEqual([]);
  });
});

describe('createPricingRuleSchema', () => {
  const base = {
    branchId: '11111111-1111-1111-1111-111111111111',
    ruleName: 'Happy Hour',
    dayOfWeek: 2,
    startTime: '13:00',
    endTime: '16:00',
  };

  it('default serviceId=null, priceMultiplier=1, discountPercent=0', () => {
    const r = createPricingRuleSchema.parse(base);
    expect(r.serviceId).toBeNull();
    expect(r.priceMultiplier).toBe(1);
    expect(r.discountPercent).toBe(0);
  });

  it('endTime ຕ້ອງຫຼັງ startTime ແລະ discountPercent ≤ 90', () => {
    expect(() => createPricingRuleSchema.parse({ ...base, endTime: '13:00' })).toThrow();
    expect(() => createPricingRuleSchema.parse({ ...base, discountPercent: 95 })).toThrow();
  });
});
