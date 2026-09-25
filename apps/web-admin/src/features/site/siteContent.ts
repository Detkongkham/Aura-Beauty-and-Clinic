/**
 * Public-site copy (lo + en), kept in one typed module instead of the admin
 * locale JSON — it is marketing content with nested lists, not UI strings.
 *
 * SAMPLE CONTENT: prices, figures, team members and reviews below are
 * placeholders for the clinic to replace before this page goes live. Nothing
 * here is read from the database (the catalog API requires auth).
 */
export type Lang = 'lo' | 'en';
export type L = Record<Lang, string>;

export const pick = (v: L, lang: Lang) => v[lang];

export const nav = {
  services: { lo: 'ບໍລິການ', en: 'Services' },
  why: { lo: 'ເປັນຫຍັງຕ້ອງ Aura', en: 'Why Aura' },
  journey: { lo: 'ຂັ້ນຕອນ', en: 'Your visit' },
  membership: { lo: 'ສະມາຊິກ', en: 'Membership' },
  team: { lo: 'ທີມແພດ', en: 'Specialists' },
  reviews: { lo: 'ຣີວິວ', en: 'Reviews' },
  branches: { lo: 'ສາຂາ', en: 'Branches' },
  faq: { lo: 'ຄຳຖາມ', en: 'FAQ' },
  book: { lo: 'ຈອງຄິວ', en: 'Book now' },
  staffLogin: { lo: 'ເຂົ້າລະບົບພະນັກງານ', en: 'Staff sign-in' },
  menu: { lo: 'ເມນູ', en: 'Menu' },
  close: { lo: 'ປິດ', en: 'Close' },
  skip: { lo: 'ຂ້າມໄປເນື້ອຫາ', en: 'Skip to content' },
  top: { lo: 'ກັບຂຶ້ນເທິງສຸດ', en: 'Back to top' },
  call: { lo: 'ໂທ', en: 'Call' },
  finder: { lo: 'ຊອກບໍລິການ', en: 'Treatment finder' },
} satisfies Record<string, L>;

export const hero = {
  eyebrow: { lo: 'ຄລີນິກຄວາມງາມ ແລະ ຜິວພັນ ລະດັບພຣີມຽມ', en: 'Premium beauty & skin clinic' },
  title: { lo: 'ຄວາມງາມທີ່ດູແລ ດ້ວຍວິທະຍາສາດ', en: 'Beauty, cared for by science' },
  body: {
    lo: 'Aura ລວມແພດຜິວໜັງ, ຜູ້ຊ່ຽວຊານດ້ານຄວາມງາມ ແລະ ເຕັກໂນໂລຢີທີ່ໄດ້ມາດຕະຖານ ໄວ້ໃນບ່ອນດຽວ — ຈອງຄິວອອນລາຍ, ເຊັກອິນດ້ວຍ QR ແລະ ຕິດຕາມຜົນການຮັກສາໄດ້ທຸກຂັ້ນຕອນ.',
    en: 'Aura brings dermatologists, aesthetic specialists and certified technology under one roof — book online, check in with a QR code and follow every step of your treatment.',
  },
  madeFor: { lo: 'ອອກແບບມາເພື່ອ', en: 'Made for your' },
  words: {
    lo: ['ຜິວທີ່ສົດໃສ', 'ຄວາມໝັ້ນໃຈ', 'ຜິວທີ່ແຂງແຮງ', 'ຊ່ວງເວລາພັກຜ່ອນ'],
    en: ['glow', 'confidence', 'healthy skin', 'me-time'],
  } satisfies Record<Lang, string[]>,
  ctaPrimary: { lo: 'ຈອງຄິວດຽວນີ້', en: 'Book an appointment' },
  ctaSecondary: { lo: 'ເບິ່ງບໍລິການ', en: 'Explore treatments' },
  rating: { lo: 'ຄະແນນຈາກລູກຄ້າ', en: 'guest rating' },
  passTitle: { lo: 'ນັດໝາຍຕໍ່ໄປ', en: 'Next visit' },
  passService: { lo: 'Hydra Glow Facial', en: 'Hydra Glow Facial' },
  passWhen: { lo: 'ພະຫັດ · 10:30', en: 'Thu · 10:30' },
  passStaff: { lo: 'ດຣ. ມະນີວັນ', en: 'Dr. Manivanh' },
  passStatus: { lo: 'ຢືນຢັນແລ້ວ', en: 'Confirmed' },
  passQr: { lo: 'ສະແກນເພື່ອເຊັກອິນ', en: 'Scan to check in' },
  qrChip: { lo: 'ເຊັກອິນ QR', en: 'QR check-in' },
  pointsTitle: { lo: 'ຄະແນນສະສົມ', en: 'Loyalty points' },
  pointsTier: { lo: 'ລະດັບ Gold', en: 'Gold tier' },
};

export const stats: Array<{ value: string; label: L }> = [
  { value: '8+', label: { lo: 'ປີແຫ່ງປະສົບການ', en: 'years of practice' } },
  { value: '40K+', label: { lo: 'ຄັ້ງທີ່ໃຫ້ບໍລິການ', en: 'treatments delivered' } },
  { value: '25', label: { lo: 'ແພດ ແລະ ຜູ້ຊ່ຽວຊານ', en: 'doctors & specialists' } },
  { value: '4.9', label: { lo: 'ຄະແນນສະເລ່ຍ', en: 'average rating' } },
];

export const trust: L[] = [
  { lo: 'ແພດຜິວໜັງມີໃບອະນຸຍາດ', en: 'Licensed dermatologists' },
  { lo: 'ເຄື່ອງມືໄດ້ມາດຕະຖານສາກົນ', en: 'Internationally certified devices' },
  { lo: 'ຂັ້ນຕອນປອດເຊື້ອທຸກຄັ້ງ', en: 'Sterile protocol, every time' },
  { lo: 'ຫ້ອງສ່ວນຕົວ', en: 'Private treatment rooms' },
  { lo: 'ປຶກສາຟຣີກ່ອນຮັກສາ', en: 'Free consultation first' },
  { lo: 'ບໍລິການເຖິງບ້ານ', en: 'Home-service available' },
];

export type ServiceIcon = 'facial' | 'skin' | 'laser' | 'body' | 'hair' | 'spa';

export interface ServiceCategory {
  id: ServiceIcon;
  name: L;
  blurb: L;
  items: Array<{ name: L; minutes: number; from: number; points: L[]; popular?: boolean }>;
}

export const servicesIntro = {
  eyebrow: { lo: 'ບໍລິການຂອງພວກເຮົາ', en: 'Our treatments' },
  title: { lo: 'ອອກແບບມາສະເພາະຜິວຂອງທ່ານ', en: 'Designed around your skin' },
  body: {
    lo: 'ທຸກບໍລິການເລີ່ມຈາກການວິເຄາະຜິວ ແລະ ປຶກສາກັບຜູ້ຊ່ຽວຊານ ເພື່ອໃຫ້ໄດ້ແຜນການຮັກສາທີ່ເໝາະສົມທີ່ສຸດ.',
    en: 'Every treatment starts with a skin analysis and a specialist consultation, so your plan fits you — not a template.',
  },
  from: { lo: 'ເລີ່ມຕົ້ນ', en: 'From' },
  minutes: { lo: 'ນາທີ', en: 'min' },
  popular: { lo: 'ຍອດນິຍົມ', en: 'Popular' },
  book: { lo: 'ຈອງບໍລິການນີ້', en: 'Book this' },
  free: { lo: 'ຟຣີ', en: 'Free' },
  sample: {
    lo: 'ລາຄາເລີ່ມຕົ້ນເປັນຂໍ້ມູນອ້າງອີງ — ແພດຈະແຈ້ງລາຄາຈິງຫຼັງການປຶກສາ.',
    en: 'Starting prices are a guide — your specialist confirms the final price after consultation.',
  },
};

export const serviceCategories: ServiceCategory[] = [
  {
    id: 'facial',
    name: { lo: 'ທຣີດເມັນໃບໜ້າ', en: 'Facials' },
    blurb: {
      lo: 'ຟື້ນຟູ, ເຕີມຄວາມຊຸ່ມຊື່ນ ແລະ ຄືນຄວາມສົດໃສໃຫ້ຜິວ',
      en: 'Restore, hydrate and bring back your glow',
    },
    items: [
      {
        name: { lo: 'Hydra Glow Facial', en: 'Hydra Glow Facial' },
        minutes: 60,
        from: 450000,
        popular: true,
        points: [
          { lo: 'ທຳຄວາມສະອາດຮູຂຸມຂົນຢ່າງເລິກ', en: 'Deep pore cleanse' },
          { lo: 'ເຕີມຄວາມຊຸ່ມຊື່ນດ້ວຍ Hyaluronic', en: 'Hyaluronic infusion' },
        ],
      },
      {
        name: { lo: 'Oxygen Brightening', en: 'Oxygen Brightening' },
        minutes: 75,
        from: 550000,
        points: [
          { lo: 'ຜິວກະຈ່າງໃສ ສີຜິວສະໝ່ຳສະເໝີ', en: 'Brighter, even tone' },
          { lo: 'ເໝາະກັບຜິວອິດເມື່ອຍ', en: 'Ideal for tired skin' },
        ],
      },
      {
        name: { lo: 'Gold Collagen Mask', en: 'Gold Collagen Mask' },
        minutes: 50,
        from: 380000,
        points: [
          { lo: 'ກະຕຸ້ນຄໍລາເຈນ', en: 'Collagen boost' },
          { lo: 'ຜິວເຕັ່ງຕຶງ ຍືດຍຸ່ນ', en: 'Firmer, bouncier skin' },
        ],
      },
    ],
  },
  {
    id: 'skin',
    name: { lo: 'ຄລີນິກຜິວໜັງ', en: 'Skin clinic' },
    blurb: {
      lo: 'ຮັກສາສິວ, ຝ້າ, ກະ ໂດຍແພດຜິວໜັງ',
      en: 'Acne, melasma and pigment care by dermatologists',
    },
    items: [
      {
        name: { lo: 'ຮັກສາສິວ ແລະ ຮອຍສິວ', en: 'Acne & scar program' },
        minutes: 45,
        from: 350000,
        popular: true,
        points: [
          { lo: 'ວິນິດໄສໂດຍແພດ', en: 'Doctor-led diagnosis' },
          { lo: 'ແຜນຮັກສາຕາມລະດັບສິວ', en: 'Plan by acne grade' },
        ],
      },
      {
        name: { lo: 'ຮັກສາຝ້າ-ກະ', en: 'Melasma & pigment' },
        minutes: 60,
        from: 600000,
        points: [
          { lo: 'ລົດເລືອນຈຸດດ່າງດຳ', en: 'Fades dark spots' },
          { lo: 'ຕິດຕາມຜົນດ້ວຍຮູບກ່ອນ-ຫຼັງ', en: 'Tracked with before/after photos' },
        ],
      },
      {
        name: { lo: 'ວິເຄາະຜິວດ້ວຍກ້ອງ AI', en: 'AI skin analysis' },
        minutes: 20,
        from: 0,
        points: [
          { lo: 'ຟຣີສຳລັບລູກຄ້າໃໝ່', en: 'Free for new guests' },
          { lo: 'ລາຍງານຜິວແບບລະອຽດ', en: 'Detailed skin report' },
        ],
      },
    ],
  },
  {
    id: 'laser',
    name: { lo: 'ເລເຊີ ແລະ ເຕັກໂນໂລຢີ', en: 'Laser & devices' },
    blurb: { lo: 'ເຕັກໂນໂລຢີທີ່ປອດໄພ ໄດ້ຜົນຊັດເຈນ', en: 'Safe technology, visible results' },
    items: [
      {
        name: { lo: 'Pico Laser', en: 'Pico Laser' },
        minutes: 40,
        from: 1200000,
        popular: true,
        points: [
          { lo: 'ລົບຮອຍດ່າງດຳ ແລະ ຮອຍສັກ', en: 'Pigment & tattoo removal' },
          { lo: 'ພັກຟື້ນໄວ', en: 'Minimal downtime' },
        ],
      },
      {
        name: { lo: 'ກຳຈັດຂົນຖາວອນ', en: 'Laser hair removal' },
        minutes: 30,
        from: 500000,
        points: [
          { lo: 'ບໍ່ເຈັບ ປອດໄພທຸກສີຜິວ', en: 'Comfortable, all skin tones' },
          { lo: 'ມີແພັກເກັດຫຼາຍຄັ້ງ', en: 'Multi-session packages' },
        ],
      },
      {
        name: { lo: 'HIFU ຍົກກະຊັບ', en: 'HIFU lifting' },
        minutes: 90,
        from: 3500000,
        points: [
          { lo: 'ຍົກກະຊັບໂດຍບໍ່ຕ້ອງຜ່າຕັດ', en: 'Non-surgical lift' },
          { lo: 'ຜົນຢູ່ໄດ້ດົນ', en: 'Long-lasting result' },
        ],
      },
    ],
  },
  {
    id: 'body',
    name: { lo: 'ດູແລຮູບຮ່າງ', en: 'Body' },
    blurb: { lo: 'ກະຊັບສັດສ່ວນ ແລະ ຟື້ນຟູຜິວກາຍ', en: 'Contour, firm and renew' },
    items: [
      {
        name: { lo: 'Body Contour', en: 'Body Contour' },
        minutes: 60,
        from: 900000,
        points: [
          { lo: 'ລົດໄຂມັນສະເພາະຈຸດ', en: 'Targets stubborn fat' },
          { lo: 'ບໍ່ຕ້ອງພັກຟື້ນ', en: 'No downtime' },
        ],
      },
      {
        name: { lo: 'ຂັດຜິວ ແລະ ບຳລຸງກາຍ', en: 'Body polish & wrap' },
        minutes: 75,
        from: 400000,
        points: [
          { lo: 'ຜິວນຸ່ມລື່ນ', en: 'Silky-smooth skin' },
          { lo: 'ນ້ຳມັນທຳມະຊາດ', en: 'Natural oils' },
        ],
      },
    ],
  },
  {
    id: 'hair',
    name: { lo: 'ຜົມ ແລະ ເລັບ', en: 'Hair & nails' },
    blurb: { lo: 'ສຳເລັດທຸກລຸກໃນບ່ອນດຽວ', en: 'Finish the look in one visit' },
    items: [
      {
        name: { lo: 'ສະປາໜັງຫົວ', en: 'Scalp spa' },
        minutes: 45,
        from: 250000,
        points: [
          { lo: 'ລົດຜົມຫຼົ່ນ', en: 'Reduces hair fall' },
          { lo: 'ຜ່ອນຄາຍຄວາມເຄັ່ງຕຶງ', en: 'Deeply relaxing' },
        ],
      },
      {
        name: { lo: 'ທຳເລັບ Gel', en: 'Gel manicure' },
        minutes: 60,
        from: 200000,
        points: [
          { lo: 'ສີຕິດທົນ 3 ອາທິດ', en: 'Lasts up to 3 weeks' },
          { lo: 'ອຸປະກອນປອດເຊື້ອ', en: 'Sterilised tools' },
        ],
      },
    ],
  },
  {
    id: 'spa',
    name: { lo: 'ສະປາ ແລະ ນວດ', en: 'Spa & massage' },
    blurb: { lo: 'ພັກຜ່ອນຮ່າງກາຍ ແລະ ຈິດໃຈ', en: 'Rest for body and mind' },
    items: [
      {
        name: { lo: 'ນວດນ້ຳມັນອະໂຣມາ', en: 'Aroma oil massage' },
        minutes: 90,
        from: 350000,
        popular: true,
        points: [
          { lo: 'ຜ່ອນຄາຍກ້າມເນື້ອ', en: 'Releases muscle tension' },
          { lo: 'ເລືອກກິ່ນໄດ້', en: 'Choose your scent' },
        ],
      },
      {
        name: { lo: 'ນວດຫີນຮ້ອນ', en: 'Hot stone ritual' },
        minutes: 90,
        from: 450000,
        points: [
          { lo: 'ກະຕຸ້ນການໄຫຼວຽນເລືອດ', en: 'Boosts circulation' },
          { lo: 'ນອນຫຼັບສະບາຍ', en: 'Better sleep' },
        ],
      },
    ],
  },
];

export type ConcernIcon = 'acne' | 'spots' | 'dull' | 'ageing' | 'hair' | 'stress';

export const finderIntro = {
  eyebrow: { lo: 'ຊອກບໍລິການທີ່ເໝາະກັບທ່ານ', en: 'Treatment finder' },
  title: { lo: 'ຜິວຂອງທ່ານກຳລັງກັງວົນເລື່ອງຫຍັງ?', en: 'What would you like to work on?' },
  body: {
    lo: 'ເລືອກໄດ້ຫຼາຍຂໍ້ — ພວກເຮົາຈະແນະນຳບໍລິການທີ່ເລີ່ມຕົ້ນໄດ້ເລີຍ. ແພດຈະຢືນຢັນແຜນອີກຄັ້ງຕອນປຶກສາ.',
    en: 'Pick one or more — we’ll suggest where to start. Your specialist confirms the plan at consultation.',
  },
  empty: {
    lo: 'ເລືອກຢ່າງໜ້ອຍໜຶ່ງຂໍ້ເພື່ອເບິ່ງຄຳແນະນຳ',
    en: 'Choose at least one concern to see suggestions',
  },
  matches: { lo: 'ບໍລິການທີ່ແນະນຳ', en: 'Suggested for you' },
  reset: { lo: 'ລ້າງການເລືອກ', en: 'Clear' },
  view: { lo: 'ເບິ່ງໃນລາຍການບໍລິການ', en: 'See in treatments' },
};

export const concerns: Array<{ id: ConcernIcon; label: L; services: string[] }> = [
  {
    id: 'acne',
    label: { lo: 'ສິວ ແລະ ຮອຍສິວ', en: 'Acne & scars' },
    services: ['Acne & scar program', 'Hydra Glow Facial'],
  },
  {
    id: 'spots',
    label: { lo: 'ຝ້າ ກະ ຈຸດດ່າງດຳ', en: 'Dark spots' },
    services: ['Melasma & pigment', 'Pico Laser'],
  },
  {
    id: 'dull',
    label: { lo: 'ຜິວໝອງ ຂາດນ້ຳ', en: 'Dull, dry skin' },
    services: ['Oxygen Brightening', 'Hydra Glow Facial'],
  },
  {
    id: 'ageing',
    label: { lo: 'ຮິ້ວຮອຍ ຜິວຢ່ອນ', en: 'Lines & sagging' },
    services: ['HIFU lifting', 'Gold Collagen Mask'],
  },
  {
    id: 'hair',
    label: { lo: 'ຂົນສ່ວນເກີນ', en: 'Unwanted hair' },
    services: ['Laser hair removal'],
  },
  {
    id: 'stress',
    label: { lo: 'ຄວາມເມື່ອຍລ້າ', en: 'Stress & fatigue' },
    services: ['Aroma oil massage', 'Hot stone ritual', 'Scalp spa'],
  },
];

export const calculator = {
  title: { lo: 'ຄິດໄລ່ຄະແນນຂອງທ່ານ', en: 'Estimate your points' },
  spend: { lo: 'ຍອດໃຊ້ຈ່າຍຕໍ່ເດືອນ', en: 'Monthly spend' },
  yearPoints: { lo: 'ຄະແນນຕໍ່ປີ', en: 'Points per year' },
  tierIn: { lo: 'ຮອດລະດັບ', en: 'Reaches' },
  months: { lo: 'ເດືອນ', en: 'months' },
  already: { lo: 'ພາຍໃນປີທຳອິດ', en: 'within the first year' },
  worth: { lo: 'ມູນຄ່າແລກໄດ້ປະມານ', en: 'Worth about' },
  note: {
    lo: 'ຕົວເລກປະມານການ ຄິດຕາມອັດຕາສະສົມຂອງແຕ່ລະລະດັບ; 1 ຄະແນນ ≈ ₭100 ເມື່ອແລກ.',
    en: 'Estimate using each tier’s earn rate; 1 point ≈ ₭100 when redeemed.',
  },
};

export const whyIntro = {
  eyebrow: { lo: 'ເປັນຫຍັງຕ້ອງ Aura', en: 'Why Aura' },
  title: { lo: 'ມາດຕະຖານການແພດ ໃນບັນຍາກາດທີ່ຜ່ອນຄາຍ', en: 'Medical standards, in a calm setting' },
};

export const pillars: Array<{ icon: 'shield' | 'doctor' | 'tech' | 'heart'; title: L; body: L }> = [
  {
    icon: 'doctor',
    title: { lo: 'ແພດຜູ້ຊ່ຽວຊານດູແລ', en: 'Doctor-led care' },
    body: {
      lo: 'ທຸກແຜນການຮັກສາຖືກອອກແບບ ແລະ ຕິດຕາມໂດຍແພດຜິວໜັງທີ່ມີໃບອະນຸຍາດ.',
      en: 'Every plan is designed and followed up by a licensed dermatologist.',
    },
  },
  {
    icon: 'tech',
    title: { lo: 'ເຕັກໂນໂລຢີທັນສະໄໝ', en: 'Modern technology' },
    body: {
      lo: 'ເຄື່ອງມືໄດ້ມາດຕະຖານສາກົນ ພ້ອມລະບົບວິເຄາະຜິວ ແລະ ບັນທຶກຜົນການຮັກສາ.',
      en: 'Certified devices plus skin analysis and a treatment record you can follow.',
    },
  },
  {
    icon: 'shield',
    title: { lo: 'ປອດໄພ ແລະ ໂປ່ງໃສ', en: 'Safe & transparent' },
    body: {
      lo: 'ລາຄາຊັດເຈນກ່ອນເລີ່ມ, ຂັ້ນຕອນປອດເຊື້ອ ແລະ ຂໍ້ມູນສ່ວນຕົວຖືກປົກປ້ອງ.',
      en: 'Clear pricing up front, sterile protocol and protected personal data.',
    },
  },
  {
    icon: 'heart',
    title: { lo: 'ດູແລຕໍ່ເນື່ອງ', en: 'Care that continues' },
    body: {
      lo: 'ແຈ້ງເຕືອນນັດໝາຍ, ແຊັດກັບທີມງານ ແລະ ຕິດຕາມຫຼັງການຮັກສາຜ່ານແອັບ.',
      en: 'Reminders, chat with your team and aftercare follow-up in the app.',
    },
  },
];

export const journeyIntro = {
  eyebrow: { lo: 'ການມາໃຊ້ບໍລິການ', en: 'Your visit' },
  title: {
    lo: 'ງ່າຍ ຕັ້ງແຕ່ຈອງ ຈົນຮອດການດູແລຫຼັງຮັກສາ',
    en: 'Effortless, from booking to aftercare',
  },
};

export const journey: Array<{ title: L; body: L }> = [
  {
    title: { lo: 'ຈອງຜ່ານແອັບ', en: 'Book in the app' },
    body: {
      lo: 'ເລືອກບໍລິການ, ສາຂາ, ແພດ ແລະ ເວລາທີ່ວ່າງ — ຢືນຢັນທັນທີ.',
      en: 'Pick a treatment, branch, specialist and open slot — confirmed instantly.',
    },
  },
  {
    title: { lo: 'ເຊັກອິນດ້ວຍ QR', en: 'Check in with QR' },
    body: {
      lo: 'ສະແກນ QR ທີ່ໜ້າຮ້ານ ແລະ ເບິ່ງລຳດັບຄິວແບບສົດ.',
      en: 'Scan the QR at the front desk and watch your place in the queue live.',
    },
  },
  {
    title: { lo: 'ປຶກສາ ແລະ ຮັກສາ', en: 'Consult & treat' },
    body: {
      lo: 'ແພດວິເຄາະຜິວ ອະທິບາຍແຜນ ແລະ ບັນທຶກຜົນທຸກຄັ້ງ.',
      en: 'Your specialist analyses, explains the plan and records every session.',
    },
  },
  {
    title: { lo: 'ດູແລຕໍ່ ແລະ ສະສົມຄະແນນ', en: 'Aftercare & rewards' },
    body: {
      lo: 'ຮັບຄຳແນະນຳຫຼັງຮັກສາ, ຄະແນນສະສົມ ແລະ ສິດພິເສດສຳລັບສະມາຊິກ.',
      en: 'Get aftercare tips, loyalty points and member-only perks.',
    },
  },
];

export const membershipIntro = {
  eyebrow: { lo: 'ສະມາຊິກ Aura', en: 'Aura membership' },
  title: { lo: 'ຍິ່ງມາ ຍິ່ງຄຸ້ມ', en: 'The more you visit, the more you get' },
  body: {
    lo: 'ທຸກການໃຊ້ຈ່າຍໄດ້ຮັບຄະແນນ ນຳໄປແລກສ່ວນຫຼຸດ ຫຼື ບໍລິການໄດ້. ແນະນຳໝູ່ ຮັບຄະແນນເພີ່ມທັງສອງຝ່າຍ.',
    en: 'Every visit earns points you can redeem for discounts or treatments. Refer a friend and you both earn more.',
  },
  perksTitle: { lo: 'ສິດປະໂຫຍດ', en: 'Perks' },
  extrasTitle: { lo: 'ເພີ່ມຄວາມຄຸ້ມຄ່າ', en: 'More ways to save' },
};

export const tiers: Array<{ name: string; spend: L; perks: L[]; featured?: boolean }> = [
  {
    name: 'Silver',
    spend: { lo: 'ເລີ່ມຕົ້ນທັນທີ', en: 'From your first visit' },
    perks: [
      { lo: 'ຄະແນນ 1 ຕໍ່ ₭10,000', en: '1 point per ₭10,000' },
      { lo: 'ສ່ວນຫຼຸດວັນເກີດ 10%', en: '10% birthday treat' },
      { lo: 'ແຈ້ງເຕືອນໂປຣໂມຊັນກ່ອນໃຜ', en: 'Early promo alerts' },
    ],
  },
  {
    name: 'Gold',
    spend: { lo: 'ຍອດສະສົມ ₭5 ລ້ານ', en: '₭5M lifetime spend' },
    featured: true,
    perks: [
      { lo: 'ຄະແນນ x1.5', en: '1.5× points' },
      { lo: 'ສ່ວນຫຼຸດວັນເກີດ 15%', en: '15% birthday treat' },
      { lo: 'ຈອງຄິວລ່ວງໜ້າໄດ້ກ່ອນ', en: 'Priority booking' },
      { lo: 'ປຶກສາແພດຟຣີທຸກເດືອນ', en: 'Monthly free consultation' },
    ],
  },
  {
    name: 'Platinum',
    spend: { lo: 'ຍອດສະສົມ ₭15 ລ້ານ', en: '₭15M lifetime spend' },
    perks: [
      { lo: 'ຄະແນນ x2', en: '2× points' },
      { lo: 'ຫ້ອງ VIP ສ່ວນຕົວ', en: 'Private VIP suite' },
      { lo: 'ຜູ້ດູແລສ່ວນຕົວ', en: 'Personal concierge' },
      { lo: 'ບໍລິການເຖິງບ້ານບໍ່ມີຄ່າເດີນທາງ', en: 'Free home-service travel' },
    ],
  },
];

export const extras: Array<{ icon: 'package' | 'gift' | 'referral' | 'home'; title: L; body: L }> =
  [
    {
      icon: 'package',
      title: { lo: 'ແພັກເກັດຄອສ', en: 'Treatment packages' },
      body: { lo: 'ຊື້ເປັນຄອສ ປະຢັດສູງສຸດ 25%', en: 'Buy a course, save up to 25%' },
    },
    {
      icon: 'gift',
      title: { lo: 'ບັດຂອງຂວັນ', en: 'Gift cards' },
      body: { lo: 'ມອບຄວາມງາມໃຫ້ຄົນທີ່ທ່ານຮັກ', en: 'Give the gift of glow' },
    },
    {
      icon: 'referral',
      title: { lo: 'ແນະນຳໝູ່', en: 'Refer a friend' },
      body: { lo: 'ຮັບຄະແນນທັງສອງຝ່າຍ', en: 'Points for you both' },
    },
    {
      icon: 'home',
      title: { lo: 'ບໍລິການເຖິງບ້ານ', en: 'Home service' },
      body: { lo: 'ຕິດຕາມພະນັກງານແບບສົດໃນແອັບ', en: 'Track your specialist live' },
    },
  ];

export const teamIntro = {
  eyebrow: { lo: 'ທີມແພດ ແລະ ຜູ້ຊ່ຽວຊານ', en: 'Our specialists' },
  title: { lo: 'ຄົນທີ່ຢູ່ເບື້ອງຫຼັງຜິວສວຍຂອງທ່ານ', en: 'The people behind your glow' },
  years: { lo: 'ປີ', en: 'yrs' },
  bookWith: { lo: 'ຈອງກັບ', en: 'Book with' },
  experience: { lo: 'ປະສົບການ', en: 'Experience' },
};

export const team: Array<{ name: L; role: L; years: number; focus: L }> = [
  {
    name: { lo: 'ດຣ. ມະນີວັນ ສີສຸວັນ', en: 'Dr. Manivanh Sisouvanh' },
    role: { lo: 'ແພດຜິວໜັງ · ຜູ້ອຳນວຍການແພດ', en: 'Dermatologist · Medical director' },
    years: 12,
    focus: { lo: 'ເລເຊີ ແລະ ຝ້າ-ກະ', en: 'Laser & pigmentation' },
  },
  {
    name: { lo: 'ດຣ. ສຸລິຍາ ພົມມະຈັນ', en: 'Dr. Souliya Phommachanh' },
    role: { lo: 'ແພດຄວາມງາມ', en: 'Aesthetic physician' },
    years: 9,
    focus: { lo: 'ຍົກກະຊັບ ແລະ ຕ້ານຮິ້ວຮອຍ', en: 'Lifting & anti-ageing' },
  },
  {
    name: { lo: 'ນາງ ດາລາວັນ ແກ້ວມະນີ', en: 'Daravanh Keomany' },
    role: { lo: 'ຫົວໜ້າຜູ້ຊ່ຽວຊານດ້ານຜິວ', en: 'Lead skin therapist' },
    years: 8,
    focus: { lo: 'ທຣີດເມັນໃບໜ້າ', en: 'Advanced facials' },
  },
  {
    name: { lo: 'ນາງ ພອນສະຫວັນ ວົງໄຊ', en: 'Phonesavanh Vongxay' },
    role: { lo: 'ຜູ້ຊ່ຽວຊານສະປາ', en: 'Spa specialist' },
    years: 6,
    focus: { lo: 'ນວດ ແລະ ດູແລຮູບຮ່າງ', en: 'Massage & body care' },
  },
];

export const reviewsIntro = {
  eyebrow: { lo: 'ສຽງຈາກລູກຄ້າ', en: 'Guest stories' },
  title: { lo: 'ຄວາມໝັ້ນໃຈທີ່ເຫັນໄດ້', en: 'Confidence you can see' },
  prev: { lo: 'ຣີວິວກ່ອນໜ້າ', en: 'Previous review' },
  next: { lo: 'ຣີວິວຖັດໄປ', en: 'Next review' },
  pause: { lo: 'ຢຸດການເລື່ອນອັດຕະໂນມັດ', en: 'Pause auto-rotation' },
  play: { lo: 'ເລີ່ມການເລື່ອນອັດຕະໂນມັດ', en: 'Start auto-rotation' },
  of: { lo: 'ຈາກ', en: 'of' },
  based: { lo: 'ຈາກຣີວິວຫຼັງການໃຊ້ບໍລິການ', en: 'from post-visit reviews' },
};

export const reviews: Array<{ quote: L; name: string; service: L }> = [
  {
    quote: {
      lo: 'ຮັກສາສິວມາ 3 ເດືອນ ຜິວດີຂຶ້ນຈົນໝູ່ທັກ. ແພດອະທິບາຍລະອຽດທຸກຄັ້ງ ແລະ ແອັບແຈ້ງເຕືອນນັດໃຫ້ຕະຫຼອດ.',
      en: 'Three months into my acne program and friends keep noticing. The doctor explains everything and the app never lets me miss a visit.',
    },
    name: 'Noy K.',
    service: { lo: 'ຮັກສາສິວ ແລະ ຮອຍສິວ', en: 'Acne & scar program' },
  },
  {
    quote: {
      lo: 'ຈອງງ່າຍ ເຊັກອິນດ້ວຍ QR ບໍ່ຕ້ອງລໍຖ້າດົນ. ຫ້ອງສະອາດ ພະນັກງານສຸພາບຫຼາຍ.',
      en: 'Easy to book, QR check-in meant almost no wait. Spotless rooms and genuinely kind staff.',
    },
    name: 'Bee S.',
    service: { lo: 'Hydra Glow Facial', en: 'Hydra Glow Facial' },
  },
  {
    quote: {
      lo: 'ເຮັດ Pico Laser ຮອຍດ່າງດຳຈາງລົງຫຼາຍ. ມີຮູບກ່ອນ-ຫຼັງໃຫ້ເບິ່ງ ເຫັນຄວາມແຕກຕ່າງຊັດເຈນ.',
      en: 'Pico Laser faded my dark spots a lot. The before/after photos made the difference obvious.',
    },
    name: 'Mick P.',
    service: { lo: 'Pico Laser', en: 'Pico Laser' },
  },
  {
    quote: {
      lo: 'ໃຊ້ບໍລິການນວດເຖິງບ້ານ ເບິ່ງໄດ້ວ່າພະນັກງານຈະມາຮອດຕອນໃດ. ສະດວກ ແລະ ເປັນມືອາຊີບ.',
      en: 'Booked a home massage and could see exactly when the therapist would arrive. Convenient and professional.',
    },
    name: 'Vanh T.',
    service: { lo: 'ນວດນ້ຳມັນອະໂຣມາ', en: 'Aroma oil massage' },
  },
];

export const branchesIntro = {
  eyebrow: { lo: 'ສາຂາຂອງພວກເຮົາ', en: 'Visit us' },
  title: { lo: 'ໃກ້ທ່ານກວ່າທີ່ຄິດ', en: 'Closer than you think' },
  hours: { lo: 'ເວລາເປີດ', en: 'Opening hours' },
  directions: { lo: 'ເສັ້ນທາງ', en: 'Directions' },
  call: { lo: 'ໂທຫາ', en: 'Call' },
  openNow: { lo: 'ເປີດຢູ່', en: 'Open now' },
  now: { lo: 'ເວລາວຽງຈັນຕອນນີ້', en: 'Vientiane time now' },
  closesIn: { lo: 'ປິດໃນອີກ', en: 'Closes in' },
  opensAt: { lo: 'ເປີດເວລາ', en: 'Opens at' },
  hrs: { lo: 'ຊມ', en: 'h' },
  min: { lo: 'ນທ', en: 'm' },
  closed: { lo: 'ປິດແລ້ວ', en: 'Closed' },
};

export const branches: Array<{
  name: L;
  address: L;
  hours: L;
  open: number;
  close: number;
  phone: string;
  map: string;
}> = [
  {
    name: { lo: 'ສາຂາ ນະຄອນຫຼວງ (ສຳນັກງານໃຫຍ່)', en: 'Vientiane — flagship' },
    address: {
      lo: 'ຖະໜົນ ເສດຖາທິລາດ, ບ້ານ ມີໄຊ, ເມືອງ ຈັນທະບູລີ',
      en: 'Setthathirath Rd, Mixay, Chanthabouly',
    },
    hours: { lo: 'ທຸກວັນ 09:00 – 20:00', en: 'Daily 09:00 – 20:00' },
    open: 9,
    close: 20,
    phone: '+856 20 5555 0101',
    map: 'https://maps.google.com/?q=Setthathirath+Road+Vientiane',
  },
  {
    name: { lo: 'ສາຂາ ໂພນຕ້ອງ', en: 'Phontong' },
    address: { lo: 'ຖະໜົນ ກຳແພງເມືອງ, ເມືອງ ຈັນທະບູລີ', en: 'Kamphaengmeuang Rd, Chanthabouly' },
    hours: { lo: 'ທຸກວັນ 10:00 – 21:00', en: 'Daily 10:00 – 21:00' },
    open: 10,
    close: 21,
    phone: '+856 20 5555 0202',
    map: 'https://maps.google.com/?q=Phontong+Vientiane',
  },
  {
    name: { lo: 'ສາຂາ ຫຼວງພະບາງ', en: 'Luang Prabang' },
    address: { lo: 'ຖະໜົນ ສີສະຫວ່າງວົງ, ເມືອງ ຫຼວງພະບາງ', en: 'Sisavangvong Rd, Luang Prabang' },
    hours: { lo: 'ຈັນ – ເສົາ 09:00 – 19:00', en: 'Mon – Sat 09:00 – 19:00' },
    open: 9,
    close: 19,
    phone: '+856 20 5555 0303',
    map: 'https://maps.google.com/?q=Sisavangvong+Road+Luang+Prabang',
  },
];

export const faqIntro = {
  eyebrow: { lo: 'ຄຳຖາມທີ່ພົບເລື້ອຍ', en: 'Questions' },
  title: { lo: 'ທຸກຢ່າງທີ່ຄວນຮູ້ກ່ອນມາ', en: 'Good to know before you visit' },
};

export const faqs: Array<{ q: L; a: L }> = [
  {
    q: { lo: 'ຕ້ອງຈອງລ່ວງໜ້າບໍ?', en: 'Do I need to book ahead?' },
    a: {
      lo: 'ແນະນຳໃຫ້ຈອງຜ່ານແອັບເພື່ອຮັບປະກັນເວລາ. ລູກຄ້າ walk-in ສາມາດຮັບບັດຄິວທີ່ໜ້າຮ້ານ ແລະ ຕິດຕາມລຳດັບຄິວໄດ້.',
      en: 'Booking in the app guarantees your time. Walk-ins can take a queue ticket at the front desk and follow their place in line.',
    },
  },
  {
    q: { lo: 'ຍົກເລີກ ຫຼື ເລື່ອນນັດໄດ້ບໍ?', en: 'Can I cancel or reschedule?' },
    a: {
      lo: 'ໄດ້ ໃນແອັບ ພາຍໃນໄລຍະເວລາທີ່ຄລີນິກກຳນົດກ່ອນນັດໝາຍ. ລາຍລະອຽດຈະສະແດງໃນໜ້ານັດໝາຍຂອງທ່ານ.',
      en: 'Yes — in the app, up to the cancellation window set by the clinic. The exact cut-off is shown on your appointment.',
    },
  },
  {
    q: { lo: 'ຊຳລະເງິນແນວໃດໄດ້ແດ່?', en: 'How can I pay?' },
    a: {
      lo: 'ຮັບເງິນສົດ, ໂອນຜ່ານ QR ທະນາຄານ, ບັດຂອງຂວັນ ແລະ ຄະແນນສະສົມ — ສາມາດແບ່ງຊຳລະຫຼາຍຊ່ອງທາງໃນບິນດຽວ.',
      en: 'Cash, bank QR transfer, gift cards and loyalty points — you can split one bill across several of them.',
    },
  },
  {
    q: {
      lo: 'ການຮັກສາເຈັບບໍ ແລະ ຕ້ອງພັກຟື້ນດົນປານໃດ?',
      en: 'Does it hurt, and is there downtime?',
    },
    a: {
      lo: 'ສ່ວນໃຫຍ່ບໍ່ເຈັບ ຫຼື ເຈັບໜ້ອຍ. ແພດຈະແຈ້ງໄລຍະພັກຟື້ນ ແລະ ການດູແລຫຼັງຮັກສາໃຫ້ກ່ອນເລີ່ມທຸກຄັ້ງ.',
      en: 'Most treatments are painless or mildly uncomfortable. Your specialist explains downtime and aftercare before you start.',
    },
  },
  {
    q: { lo: 'ຂໍ້ມູນ ແລະ ຮູບຂອງຂ້ອຍປອດໄພບໍ?', en: 'Are my records and photos private?' },
    a: {
      lo: 'ປອດໄພ. ຮູບກ່ອນ-ຫຼັງ ແລະ ປະຫວັດການຮັກສາເຂົ້າເຖິງໄດ້ສະເພາະທີມທີ່ດູແລທ່ານ ແລະ ທຸກການເຂົ້າເບິ່ງຖືກບັນທຶກໄວ້.',
      en: 'Yes. Before/after photos and treatment history are only visible to your care team, and every access is logged.',
    },
  },
];

export const appCta = {
  title: { lo: 'ຄວາມງາມຂອງທ່ານ ຢູ່ໃນມືຖື', en: 'Your glow, in your pocket' },
  body: {
    lo: 'ດາວໂຫຼດແອັບ Aura ເພື່ອຈອງຄິວ, ເຊັກອິນ, ແຊັດກັບທີມງານ, ຊື້ແພັກເກັດ ແລະ ຕິດຕາມຄະແນນສະສົມ.',
    en: 'Get the Aura app to book, check in, chat with your team, buy packages and track your points.',
  },
  ios: { lo: 'ດາວໂຫຼດໃນ App Store', en: 'Download on the App Store' },
  android: { lo: 'ດາວໂຫຼດໃນ Google Play', en: 'Get it on Google Play' },
  soon: { lo: 'ໄວໆນີ້', en: 'Coming soon' },
};

export const footer = {
  tagline: {
    lo: 'ຄລີນິກຄວາມງາມ ແລະ ຜິວພັນ ທີ່ໃສ່ໃຈທຸກລາຍລະອຽດ.',
    en: 'A beauty & skin clinic that cares about every detail.',
  },
  explore: { lo: 'ສຳຫຼວດ', en: 'Explore' },
  contact: { lo: 'ຕິດຕໍ່', en: 'Contact' },
  rights: { lo: 'ສະຫງວນລິຂະສິດ', en: 'All rights reserved' },
  email: 'hello@aura-clinic.la',
  phone: '+856 20 5555 0101',
};
