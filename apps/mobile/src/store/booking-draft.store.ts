import { create } from 'zustand';

export type BookingSlot = { staffProfileId: string; startAt: string; endAt: string };

export type BookingMode = 'create' | 'reschedule';

/** ວິທີຊຳລະທີ່ລູກຄ້າເລືອກໃນຂັ້ນຢືນຢັນ. FE-only — ຍັງບໍ່ໄດ້ສົ່ງໄປ API. */
export type BookingPayMethod = 'bcel_qr' | 'at_store';

export type BookingDraft = {
  mode: BookingMode;
  rescheduleId: string | null;
  branchId: string;
  serviceId: string | null;
  serviceName: string | null;
  /** ຄຳອະທິບາຍສັ້ນ (ພາສາອັງກິດ) ສຳລັບບັດສະຫຼຸບ. */
  serviceSubtitle: string | null;
  serviceImageUrl: string | null;
  price: number | null;
  /** ລາຄາເຕັມກ່ອນຫຼຸດ (null = ບໍ່ຫຼຸດ). */
  compareAtPrice: number | null;
  /** ຈຳນວນມັດຈຳ (null = ບໍ່ຕ້ອງມັດຈຳ). */
  depositAmount: number | null;
  durationMinutes: number | null;
  /** null = "ຊ່າງໃດກໍ່ໄດ້" */
  staffProfileId: string | null;
  staffName: string | null;
  /** ນັດແບບງຽບ — ຊ່າງບໍ່ຊວນສົນທະນາ. */
  quietAppointment: boolean;
  date: string | null;
  slot: BookingSlot | null;
  customerNotes: string;
  /** ວິທີຊຳລະທີ່ເລືອກ (FE-only). */
  payMethod: BookingPayMethod;
  /** ໂມດູນ 33 — ລະຫັດແນະນຳໝູ່ (ໃສ່ຢູ່ຂັ້ນຢືນຢັນ, ໃຊ້ໄດ້ຄັ້ງດຽວ). */
  referralCode: string;
  /** ໃຊ້ສິດແພັກເກັດ (UserPackageItem.id) — ນັດນີ້ບໍ່ເກັບເງິນ. null = ຈ່າຍປົກກະຕິ. */
  userPackageItemId: string | null;
  packageName: string | null;
  /** ຈຳນວນຄັ້ງທີ່ເຫຼືອກ່ອນຈອງນີ້ (ສະແດງຜົນເທົ່ານັ້ນ). */
  packageRemaining: number | null;
};

type BookingDraftState = BookingDraft & {
  start: (init: Partial<BookingDraft>) => void;
  patch: (patch: Partial<BookingDraft>) => void;
  reset: () => void;
};

const EMPTY: BookingDraft = {
  mode: 'create',
  rescheduleId: null,
  branchId: '',
  serviceId: null,
  serviceName: null,
  serviceSubtitle: null,
  serviceImageUrl: null,
  price: null,
  compareAtPrice: null,
  depositAmount: null,
  durationMinutes: null,
  staffProfileId: null,
  staffName: null,
  quietAppointment: false,
  date: null,
  slot: null,
  customerNotes: '',
  payMethod: 'bcel_qr',
  referralCode: '',
  userPackageItemId: null,
  packageName: null,
  packageRemaining: null,
};

export const useBookingDraft = create<BookingDraftState>((set) => ({
  ...EMPTY,
  start: (init) => set({ ...EMPTY, ...init }),
  patch: (patch) => set(patch),
  reset: () => set({ ...EMPTY }),
}));
