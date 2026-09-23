import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const HASH = (pw: string): string => bcrypt.hashSync(pw, 12);

async function main(): Promise<void> {
  // ---- ສາຂາ ----------------------------------------------------------------
  const branch = await prisma.branch.upsert({
    where: { id: '11111111-1111-1111-1111-111111111111' },
    update: { amenities: ['wifi', 'parking', 'drink', 'lounge', 'card'] },
    create: {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Aura ສາຂາ ນະຄອນຫຼວງວຽງຈັນ',
      address: 'ຖະໜົນລ້ານຊ້າງ, ວຽງຈັນ',
      phone: '02021212121',
      baseCurrency: 'LAK',
      latitude: 17.9757,
      longitude: 102.6331,
      amenities: ['wifi', 'parking', 'drink', 'lounge', 'card'],
    },
  });

  // ---- ບັນຊີ Admin -------------------------------------------------------
  const superAdmin = await prisma.user.upsert({
    where: { phone: '02000000000' },
    update: {},
    create: {
      name: 'ຜູ້ດູແລລະບົບສູງສຸດ',
      phone: '02000000000',
      email: 'admin@aura.la',
      password: HASH('Admin@12345'),
      role: 'SUPER_ADMIN',
    },
  });

  const branchAdmin = await prisma.user.upsert({
    where: { phone: '02000000001' },
    update: {},
    create: {
      name: 'ນາງ ສົມສະຫງວນ ໄຊຍະວົງ',
      phone: '02000000001',
      email: 'manager.vte@aura.la',
      password: HASH('Manager@12345'),
      role: 'BRANCH_ADMIN',
      branchId: branch.id,
    },
  });

  // ---- ໝວດ + ບໍລິການ ---------------------------------------------------
  const hairCat = await prisma.serviceCategory.upsert({
    where: { id: '22222222-0000-0000-0000-000000000001' },
    update: {},
    create: { id: '22222222-0000-0000-0000-000000000001', name: 'ບໍລິການຜົມ' },
  });
  const skinCat = await prisma.serviceCategory.upsert({
    where: { id: '22222222-0000-0000-0000-000000000002' },
    update: {},
    create: { id: '22222222-0000-0000-0000-000000000002', name: 'ບໍລິການຜິວໜ້າ' },
  });

  const nailCat = await prisma.serviceCategory.upsert({
    where: { id: '22222222-0000-0000-0000-000000000003' },
    update: {},
    create: {
      id: '22222222-0000-0000-0000-000000000003',
      name: 'ບໍລິການເລັບ',
      imageUrl: 'https://picsum.photos/seed/aura-nail/600/400',
    },
  });
  const massageCat = await prisma.serviceCategory.upsert({
    where: { id: '22222222-0000-0000-0000-000000000004' },
    update: {},
    create: {
      id: '22222222-0000-0000-0000-000000000004',
      name: 'ບໍລິການນວດ',
      imageUrl: 'https://picsum.photos/seed/aura-massage/600/400',
    },
  });

  const haircutSteps = [
    {
      title: 'ກວດເຊັກສະພາບເສັ້ນຜົມ ແລະ ໜັງຫົວ',
      body: 'ວິເຄາະໂຄງສ້າງໃບໜ້າ, ປະເພດເສັ້ນຜົມ ແລະ ແນະນຳແບບຊົງທີ່ເໝາະສົມທີ່ສຸດ.',
    },
    {
      title: 'ສະຜົມດ້ວຍນ້ຳຢາອໍແກນິກ ພ້ອມນວດຜ່ອນຄາຍ',
      body: 'ນວດຜ່ອນຄາຍກົດຈຸດ 15 ນາທີ ດ້ວຍນ້ຳມັນຫອມລະເຫີຍ.',
    },
    {
      title: 'ອອກແບບ ແລະ ຕັດແຕ່ງຊົງຜົມໂດຍຊ່າງອາວຸໂສ',
      body: 'ຕັດແຕ່ງຊົງລະອຽດ ເນັ້ນຄວາມພິຖີພິຖັນ ແລະ ເຂົ້າຮູບໜ້າ.',
    },
    {
      title: 'ໄດຣ໌ເຊັດຊົງ ແລະ ບຳລຸງປິດທ້າຍ',
      body: 'ເຊັດຊົງໃຫ້ເຂົ້າຮູບ ພ້ອມເຄືອບເຊຣັ່ມບຳລຸງປົກປ້ອງຄວາມຮ້ອນ.',
    },
  ];
  const haircut = await prisma.service.upsert({
    where: { id: '33333333-0000-0000-0000-000000000001' },
    update: {
      imageUrl: 'https://picsum.photos/seed/aura-haircut/600/400',
      compareAtPrice: new Prisma.Decimal(150000),
      highlights: ['ຜົມສຸຂະພາບດີ', 'ຜະລິດຕະພັນອໍແກນິກ'],
      steps: haircutSteps,
    },
    create: {
      id: '33333333-0000-0000-0000-000000000001',
      categoryId: hairCat.id,
      branchId: branch.id,
      name: 'ຕັດຜົມ + ສະຜົມ',
      price: new Prisma.Decimal(120000),
      compareAtPrice: new Prisma.Decimal(150000),
      durationMinutes: 45,
      imageUrl: 'https://picsum.photos/seed/aura-haircut/600/400',
      highlights: ['ຜົມສຸຂະພາບດີ', 'ຜະລິດຕະພັນອໍແກນິກ'],
      steps: haircutSteps,
    },
  });
  const facial = await prisma.service.upsert({
    where: { id: '33333333-0000-0000-0000-000000000002' },
    update: { imageUrl: 'https://picsum.photos/seed/aura-facial/600/400' },
    create: {
      id: '33333333-0000-0000-0000-000000000002',
      categoryId: skinCat.id,
      branchId: branch.id,
      name: 'ບຳລຸງຜິວໜ້າພື້ນຖານ',
      price: new Prisma.Decimal(350000),
      durationMinutes: 60,
      requireDeposit: true,
      depositAmount: new Prisma.Decimal(100000),
      imageUrl: 'https://picsum.photos/seed/aura-facial/600/400',
    },
  });

  const extraServices: Array<[string, string, string, number, number]> = [
    ['33333333-0000-0000-0000-000000000003', 'ຍ້ອມສີຜົມ', hairCat.id, 450000, 90],
    ['33333333-0000-0000-0000-000000000004', 'ທຳເລັບເຈວ (Gel)', nailCat.id, 180000, 60],
    ['33333333-0000-0000-0000-000000000005', 'ນວດຜ່ອນຄາຍ ອະໂຣມາ', massageCat.id, 250000, 90],
    ['33333333-0000-0000-0000-000000000006', 'ບຳລຸງຜິວໜ້າ ຫຼຸດສິວ', skinCat.id, 420000, 60],
  ];
  for (const [id, name, categoryId, price, durationMinutes] of extraServices) {
    const imageUrl = `https://picsum.photos/seed/${id.slice(0, 8)}/600/400`;
    await prisma.service.upsert({
      where: { id },
      update: { imageUrl },
      create: {
        id,
        categoryId,
        branchId: branch.id,
        name,
        price: new Prisma.Decimal(price),
        durationMinutes,
        imageUrl,
      },
    });
  }

  // ---- ວັດຖຸດິບ + BOM ------------------------------------------------
  const shampoo = await prisma.product.upsert({
    where: { branchId_sku: { branchId: branch.id, sku: 'SKU-SHAMPOO-1L' } },
    update: {},
    create: {
      branchId: branch.id,
      name: 'ແຊມພູສຳລັບຮ້ານເສີມສວຍ 1 ລິດ',
      sku: 'SKU-SHAMPOO-1L',
      stockQty: 50,
      minStockQty: 10,
      costPrice: new Prisma.Decimal(85000),
      unit: 'ຕຸກ',
    },
  });
  const serum = await prisma.product.upsert({
    where: { branchId_sku: { branchId: branch.id, sku: 'SKU-SERUM-30ML' } },
    update: {},
    create: {
      branchId: branch.id,
      name: 'ເຊລັ່ມບຳລຸງຜິວໜ້າ 30 ມລ',
      sku: 'SKU-SERUM-30ML',
      stockQty: 30,
      minStockQty: 5,
      costPrice: new Prisma.Decimal(210000),
      unit: 'ຫຼອດ',
    },
  });

  await prisma.serviceConsumable.upsert({
    where: { serviceId_productId: { serviceId: haircut.id, productId: shampoo.id } },
    update: { qtyPerUse: new Prisma.Decimal(0.03) },
    create: { serviceId: haircut.id, productId: shampoo.id, qtyPerUse: new Prisma.Decimal(0.03) },
  });
  await prisma.serviceConsumable.upsert({
    where: { serviceId_productId: { serviceId: facial.id, productId: serum.id } },
    update: { qtyPerUse: new Prisma.Decimal(0.1) },
    create: { serviceId: facial.id, productId: serum.id, qtyPerUse: new Prisma.Decimal(0.1) },
  });

  // ---- ຜູ້ສະໜອງ B2B (ໂມດູນ 32) ------------------------------------
  await prisma.supplier.upsert({
    where: { id: '55555555-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '55555555-0000-0000-0000-000000000001',
      name: 'ບໍລິສັດ ບິວຕີ້ຊັບພາຍ ຈຳກັດ',
      contactPerson: 'ນາງ ສົມໃຈ',
      phone: '020 5555 0001',
      email: 'sales@beautysupply.la',
      address: 'ຖະໜົນ ໄກສອນ, ນະຄອນຫຼວງວຽງຈັນ',
    },
  });

  // ---- Dynamic Pricing / Happy Hours (ໂມດູນ 28) --------------------
  // ຊ່ວງບ່າຍທຳມະດາ (ຈັນ–ພະຫັດ) 13:00–16:00 ຫຼຸດ 20% ທຸກບໍລິການຂອງສາຂາ.
  for (const dow of [1, 2, 3, 4]) {
    await prisma.dynamicPricingRule.upsert({
      where: { id: `66666666-0000-0000-0000-00000000000${dow}` },
      update: {},
      create: {
        id: `66666666-0000-0000-0000-00000000000${dow}`,
        branchId: branch.id,
        serviceId: null,
        ruleName: 'Happy Hour ບ່າຍ',
        dayOfWeek: dow,
        startTime: '13:00',
        endTime: '16:00',
        discountPercent: 20,
        priceMultiplier: 1,
        isActive: true,
      },
    });
  }
  // ວັນເສົາ–ອາທິດ 10:00–12:00 ຄິດເພີ່ມ 10% (peak) ສະເພາະ ຕັດຜົມ + ສະຜົມ.
  for (const dow of [0, 6]) {
    await prisma.dynamicPricingRule.upsert({
      where: { id: `66666666-0000-0000-0000-00000000001${dow}` },
      update: {},
      create: {
        id: `66666666-0000-0000-0000-00000000001${dow}`,
        branchId: branch.id,
        serviceId: haircut.id,
        ruleName: 'Weekend peak (ຕັດຜົມ)',
        dayOfWeek: dow,
        startTime: '10:00',
        endTime: '12:00',
        discountPercent: 0,
        priceMultiplier: 1.1,
        isActive: true,
      },
    });
  }

  // ---- ຊ່າງ + ຕາຕະລາງເຮັດວຽກ -----------------------------------------
  const staffUser = await prisma.user.upsert({
    where: { phone: '02055500001' },
    update: { avatarUrl: 'https://i.pravatar.cc/300?u=aura-staff-1' },
    create: {
      name: 'ນາງ ດາລາ ພິມມະສອນ',
      phone: '02055500001',
      password: HASH('Staff@12345'),
      role: 'STAFF',
      branchId: branch.id,
      avatarUrl: 'https://i.pravatar.cc/300?u=aura-staff-1',
    },
  });

  const staffProfile = await prisma.staffProfile.upsert({
    where: { userId: staffUser.id },
    update: {},
    create: {
      userId: staffUser.id,
      title: 'ຊ່າງຜົມອາວຸໂສ',
      bio: 'ຊ່ຽວຊານດ້ານຕັດ-ຍ້ອມສີຜົມ ແລະ ບຳລຸງຜິວໜ້າ ກວ່າ 8 ປີ.',
      commissionRate: 0.15,
      // ໂມດູນ 29 — ເປີດຮັບ Home Service, ຢູ່ໃກ້ສາຂາ (ສຳລັບ demo/manual QA ການຈັບຄູ່ຊ່າງ).
      isHomeServiceAvailable: true,
      lastKnownLatitude: 17.977,
      lastKnownLongitude: 102.634,
      lastLocationAt: new Date(),
      staffBranches: { create: { branchId: branch.id, isPrimary: true } },
      staffServices: {
        create: [
          { serviceId: haircut.id },
          { serviceId: facial.id },
          { serviceId: '33333333-0000-0000-0000-000000000003' },
          { serviceId: '33333333-0000-0000-0000-000000000006' },
        ],
      },
    },
  });

  const staffUser2 = await prisma.user.upsert({
    where: { phone: '02055500002' },
    update: { avatarUrl: 'https://i.pravatar.cc/300?u=aura-staff-2' },
    create: {
      name: 'ນາງ ວັນນະສອນ ແກ້ວມະນີ',
      phone: '02055500002',
      password: HASH('Staff@12345'),
      role: 'STAFF',
      branchId: branch.id,
      avatarUrl: 'https://i.pravatar.cc/300?u=aura-staff-2',
    },
  });

  const staffProfile2 = await prisma.staffProfile.upsert({
    where: { userId: staffUser2.id },
    update: {},
    create: {
      userId: staffUser2.id,
      title: 'ຊ່າງເລັບ ແລະ ນັກນວດບຳບັດ',
      bio: 'ບໍລິການທຳເລັບເຈວ ແລະ ນວດອະໂຣມາຜ່ອນຄາຍ.',
      commissionRate: 0.12,
      staffBranches: { create: { branchId: branch.id, isPrimary: true } },
      staffServices: {
        create: [
          { serviceId: '33333333-0000-0000-0000-000000000004' },
          { serviceId: '33333333-0000-0000-0000-000000000005' },
        ],
      },
    },
  });

  // ຈັນ–ເສົາ 09:00–18:00, ພັກ 12:00–13:00; ອາທິດ = ພັກ
  for (const sp of [staffProfile, staffProfile2]) {
    for (let dow = 0; dow <= 6; dow += 1) {
      const isDayOff = dow === 0;
      await prisma.workingHour.upsert({
        where: { id: `wh-${sp.id}-${dow}` },
        update: {},
        create: {
          id: `wh-${sp.id}-${dow}`,
          staffProfileId: sp.id,
          dayOfWeek: dow,
          startTime: '09:00',
          endTime: '18:00',
          breakStartTime: '12:00',
          breakEndTime: '13:00',
          isDayOff,
        },
      });
    }
  }

  // ---- ລູກຄ້າຕົວຢ່າງ --------------------------------------------------
  const customer = await prisma.user.upsert({
    where: { phone: '02099900001' },
    update: {},
    create: {
      name: 'ນາງ ນ້ອຍ ຈັນທະລາ',
      phone: '02099900001',
      password: HASH('Customer@12345'),
      role: 'CUSTOMER',
      branchId: branch.id,
      loyaltyAccount: { create: {} },
    },
  });

  // ---- Referral + Affiliate (ໂມດູນ 33) ---------------------------
  const referralCode = await prisma.referralCode.upsert({
    where: { userId: customer.id },
    update: {},
    create: { userId: customer.id, code: 'AURA-DEMO24', discountAmount: new Prisma.Decimal(50000) },
  });
  await prisma.affiliateProfile.upsert({
    where: { userId: customer.id },
    update: {},
    create: { userId: customer.id, commissionRate: 0.1 },
  });
  void referralCode;

  // ---- ອັດຕາແລກປ່ຽນ ------------------------------------------------
  for (const [base, target, rate] of [
    ['USD', 'LAK', 21500],
    ['THB', 'LAK', 600],
  ] as const) {
    await prisma.exchangeRate.upsert({
      where: { baseCurrency_targetCurrency: { baseCurrency: base, targetCurrency: target } },
      update: { rate: new Prisma.Decimal(rate) },
      create: { baseCurrency: base, targetCurrency: target, rate: new Prisma.Decimal(rate) },
    });
  }

  // ---- Phase 5: Finance settings + notification templates ----
  await prisma.appSetting.upsert({
    where: { key: 'finance.depositRate' },
    update: {},
    create: { key: 'finance.depositRate', value: 0.2 },
  });

  const notificationTemplates: Array<{
    key: string;
    channel: string;
    subject: string;
    body: string;
  }> = [
    {
      key: 'APPOINTMENT_REMINDER_24H',
      channel: 'push',
      subject: 'ເຕືອນນັດໝາຍມື້ອື່ນ',
      body: '{{serviceName}} ທີ່ {{branchName}} — {{time}}. ພົບກັນມື້ອື່ນ!',
    },
    {
      key: 'APPOINTMENT_REMINDER_1H',
      channel: 'push',
      subject: 'ນັດໝາຍຂອງທ່ານໃກ້ຮອດແລ້ວ',
      body: '{{serviceName}} ທີ່ {{branchName}} ເລີ່ມເວລາ {{time}}. ກະລຸນາມາກ່ອນ 10 ນາທີ.',
    },
    {
      key: 'WAITLIST_SLOT_OPEN',
      channel: 'push',
      subject: 'ມີຄິວວ່າງແລ້ວ!',
      body: '{{serviceName}} ທີ່ {{branchName}} ມີຄິວວ່າງໃນວັນທີ່ທ່ານລໍຖ້າ — ຈອງດ່ວນກ່ອນເຕັມ.',
    },
    {
      key: 'PAYMENT_RECEIPT',
      channel: 'push',
      subject: 'ຊຳລະເງິນສຳເລັດ',
      body: 'ຮັບຊຳລະ {{amount}} {{currency}} ຮຽບຮ້ອຍ. ຂອບໃຈທີ່ໃຊ້ບໍລິການ.',
    },
    {
      key: 'LOYALTY_EARNED',
      channel: 'push',
      subject: 'ທ່ານໄດ້ຄະແນນສະສົມ',
      body: 'ໄດ້ຮັບ {{points}} ຄະແນນຈາກການໃຊ້ບໍລິການຄັ້ງລ່າສຸດ.',
    },
    {
      key: 'GIFT_CARD_RECEIVED',
      channel: 'push',
      subject: 'ທ່ານໄດ້ຮັບບັດຂອງຂວັນ',
      body: 'ບັດຂອງຂວັນມູນຄ່າ {{amount}} {{currency}} — ລະຫັດ {{code}}.',
    },
    {
      key: 'CAMPAIGN_BIRTHDAY',
      channel: 'push',
      subject: 'ສຸກສັນວັນເກີດ 🎉',
      body: 'ຮັບສ່ວນຫຼຸດພິເສດເນື່ອງໃນວັນເກີດຂອງທ່ານ. ໃຊ້ໂຄ້ດ {{discountCode}} ຕອນຈອງ.',
    },
    {
      key: 'CAMPAIGN_WIN_BACK',
      channel: 'push',
      subject: 'ພວກເຮົາຄິດຮອດທ່ານ',
      body: 'ດົນແລ້ວບໍ່ໄດ້ພົບກັນ — ກັບມາຮັບບໍລິການພ້ອມສ່ວນຫຼຸດ {{discountCode}}.',
    },
  ];
  for (const tpl of notificationTemplates) {
    await prisma.notificationTemplate.upsert({
      where: { key: tpl.key },
      update: { channel: tpl.channel, subject: tpl.subject, body: tpl.body },
      create: { ...tpl, enabled: true },
    });
  }

  // ---- ແພັກເກັດ (ລູກຄ້າຊື້ເອງໃນແອັບ) -------------------------------------
  const seedPackages = [
    {
      id: '99999999-0000-0000-0000-000000000001',
      name: 'ຄອສຕັດຜົມ 5 ຄັ້ງ',
      description: 'ຕັດຜົມ 5 ຄັ້ງໃນລາຄາພິເສດ ໃຊ້ໄດ້ 6 ເດືອນ',
      totalPrice: 500000,
      validityDays: 180,
      items: [{ serviceId: '33333333-0000-0000-0000-000000000001', totalUnits: 5 }],
    },
    {
      id: '99999999-0000-0000-0000-000000000002',
      name: 'ຄອສຜິວສວຍ + ຜ່ອນຄາຍ',
      description: 'ບຳລຸງຜິວໜ້າ 3 ຄັ້ງ + ນວດອະໂຣມາ 2 ຄັ້ງ ໃຊ້ໄດ້ 1 ປີ',
      totalPrice: 1450000,
      validityDays: 365,
      items: [
        { serviceId: '33333333-0000-0000-0000-000000000006', totalUnits: 3 },
        { serviceId: '33333333-0000-0000-0000-000000000005', totalUnits: 2 },
      ],
    },
  ];
  for (const p of seedPackages) {
    await prisma.package.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        description: p.description,
        totalPrice: p.totalPrice,
        validityDays: p.validityDays,
        isActive: true,
      },
      create: {
        id: p.id,
        branchId: branch.id,
        name: p.name,
        description: p.description,
        totalPrice: p.totalPrice,
        validityDays: p.validityDays,
        items: { create: p.items },
      },
    });
  }

  // ---- Module 39 W1: ທະນາຄານລາວ + provider adapter config -------------------
  const banks: Array<{
    code: string;
    nameLo: string;
    nameEn: string;
    supportsQr: boolean;
  }> = [
    { code: 'BCEL', nameLo: 'ທະນາຄານການຄ້າຕ່າງປະເທດລາວ', nameEn: 'BCEL', supportsQr: true },
    { code: 'LDB', nameLo: 'ທະນາຄານພັດທະນາລາວ', nameEn: 'Lao Development Bank', supportsQr: true },
    { code: 'JDB', nameLo: 'ທະນາຄານຮ່ວມພັດທະນາ', nameEn: 'Joint Development Bank', supportsQr: false },
    { code: 'APB', nameLo: 'ທະນາຄານສົ່ງເສີມກະສິກຳ', nameEn: 'Agricultural Promotion Bank', supportsQr: false },
    { code: 'ST_BANK', nameLo: 'ທະນາຄານ ເອສທີ', nameEn: 'ST Bank', supportsQr: true },
    { code: 'LAO_VIET', nameLo: 'ທະນາຄານຮ່ວມທຸລະກິດລາວ-ຫວຽດ', nameEn: 'Lao-Viet Bank', supportsQr: true },
    { code: 'BIC', nameLo: 'ທະນາຄານການຄ້າຕ່າງປະເທດລາວ ມະຫາຊົນ', nameEn: 'BIC Bank', supportsQr: false },
  ];
  for (const b of banks) {
    await prisma.bank.upsert({ where: { code: b.code }, update: {}, create: b });
  }

  const providers: Array<{
    code: string;
    nameLo: string;
    nameEn: string;
    mode: string;
  }> = [
    { code: 'MOCK_BCEL', nameLo: 'BCEL One (ຈຳລອງ)', nameEn: 'BCEL One (mock)', mode: 'MOCK' },
    { code: 'MOCK_LAO_QR', nameLo: 'ລາວ QR ມາດຕະຖານ (ຈຳລອງ)', nameEn: 'Lao QR standard (mock)', mode: 'MOCK' },
    { code: 'MANUAL_TRANSFER', nameLo: 'ໂອນເງິນດ້ວຍມື', nameEn: 'Manual bank transfer', mode: 'MOCK' },
  ];
  for (const p of providers) {
    await prisma.paymentProvider.upsert({ where: { code: p.code }, update: {}, create: p });
  }

  const bcel = await prisma.bank.findUniqueOrThrow({ where: { code: 'BCEL' } });
  const defaultAccount = await prisma.bankAccount.findFirst({
    where: { branchId: branch.id, bankId: bcel.id },
  });
  if (!defaultAccount) {
    await prisma.bankAccount.create({
      data: {
        bankId: bcel.id,
        branchId: branch.id,
        accountName: 'Aura Beauty and Clinic',
        accountNumber: '010120001234567',
        isDefault: true,
      },
    });
  }

  // ---- Module 39 W4: ໝວດລາຍຈ່າຍມາດຕະຖານ --------------------------------------
  const expenseCategories: Array<{
    code: string;
    nameLo: string;
    nameEn: string;
    kind: 'OPERATING' | 'PAYROLL' | 'INVENTORY';
    sortOrder: number;
  }> = [
    { code: 'RENT', nameLo: 'ຄ່າເຊົ່າ', nameEn: 'Rent', kind: 'OPERATING', sortOrder: 10 },
    { code: 'SALARY', nameLo: 'ເງິນເດືອນ', nameEn: 'Salaries', kind: 'PAYROLL', sortOrder: 20 },
    { code: 'MATERIALS', nameLo: 'ວັດຖຸດິບ / ສິນຄ້າ', nameEn: 'Materials & stock', kind: 'INVENTORY', sortOrder: 30 },
    { code: 'UTILITIES', nameLo: 'ຄ່າໄຟ / ນ້ຳ / ອິນເຕີເນັດ', nameEn: 'Utilities', kind: 'OPERATING', sortOrder: 40 },
    { code: 'MARKETING', nameLo: 'ການຕະຫຼາດ', nameEn: 'Marketing', kind: 'OPERATING', sortOrder: 50 },
    { code: 'TRANSPORT', nameLo: 'ຂົນສົ່ງ', nameEn: 'Transport', kind: 'OPERATING', sortOrder: 60 },
    { code: 'MAINTENANCE', nameLo: 'ບຳລຸງຮັກສາ', nameEn: 'Maintenance', kind: 'OPERATING', sortOrder: 70 },
    { code: 'TAX', nameLo: 'ພາສີ / ຄ່າທຳນຽມ', nameEn: 'Taxes & fees', kind: 'OPERATING', sortOrder: 80 },
    { code: 'OTHER', nameLo: 'ອື່ນໆ', nameEn: 'Other', kind: 'OPERATING', sortOrder: 90 },
  ];
  for (const c of expenseCategories) {
    await prisma.expenseCategory.upsert({ where: { code: c.code }, update: {}, create: c });
  }

  console.log('✅ Seed ສຳເລັດ', {
    branch: branch.name,
    superAdmin: superAdmin.phone,
    branchAdmin: branchAdmin.phone,
    staff: staffUser.phone,
    customer: customer.phone,
    services: [haircut.name, facial.name],
    notificationTemplates: notificationTemplates.length,
    packages: seedPackages.length,
    depositRate: 0.2,
    banks: banks.length,
    paymentProviders: providers.length,
    expenseCategories: expenseCategories.length,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
