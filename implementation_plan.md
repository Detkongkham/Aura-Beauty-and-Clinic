# Master Implementation Plan: Aura Beauty & Clinic Platform (Updated v4.0)
(ລະບົບຈອງຄິວນັດໝາຍບໍລິການ ແລະ ຈັດການຄລີນິກ/ຮ້ານເສີມສວຍແບບຄົບວົງຈອນ)

ແຜນແມ່ບົດ v4.0 ສະບັບນີ້ ໄດ້ຮັບການປັບປຸງ ແລະ ແກ້ໄຂຢ່າງລະອຽດຕາມຄຳແນະນຳທັງ 4 ພາກສ່ວນ (A, B, C, D):
1. **A. Renumbering 37 ໂມດູນ:** ຈັດລຽງລຳດັບເລກ 1 ຫາ 37 ຢ່າງຕໍ່ເນື່ອງຕາມໝວດໝູ່ (Linear & Sequential) ອ່ານງ່າຍ, ບໍ່ກະໂດດຂ້າມໝວດ.
2. **B. Critical Schema Fixes (ແກ້ 6 ຂໍ້ຫຼັກ):**
   * ປ່ຽນ `startTime/endTime` (String) ເປັນ `startAt/endAt` (DateTime) ພ້ອມ composite indexes ປ້ອງກັນເວລາຊ້ອນ.
   * ເພີ່ມ `UserPackageItem` (ຮອງຮັບຄອສທີ່ມີຫຼາຍບໍລິການ) + `appointment.userPackageItemId`.
   * ເພີ່ມ `BookingGroup` (ຮອງຮັບການຈອງເປັນກຸ່ມ/ຄອບຄົວ "ຫຼາຍຄົນ 1 ບິນ").
   * ເພີ່ມລະບົບ Multi-Currency (Base Currency ທີ່ Branch, Currency ທີ່ Transaction/Payment, ພ້ອມຕາຕະລາງ `ExchangeRate`).
   * ເພີ່ມ Inventory BOM (`ServiceConsumable`) ແລະ Ledger (`StockMovement`) ຕັດສະຕັອກອັດຕະໂນມັດ ແລະ ກວດສອບຍ້ອນຫຼັງໄດ້.
   * ເພີ່ມ Split Tender (`PaymentTransaction`) ຮອງຮັບການຈ່າຍຫຼາຍຊ່ອງທາງໃນ 1 ບິນ (ມັດຈຳ + ຄະແນນ + ເງິນສົດ).
3. **C. Integrity & Consistency Fixes (ແກ້ 14 ຂໍ້ #7 ຫາ #20):**
   * Foreign Keys & Relations ຄົບຖ້ວນທຸກຕາຕະລາງ (`Waitlist`, `GiftCard`, `ChatMessage`).
   * Threaded Chat Model (`Conversation`, `ConversationParticipant`, `ChatMessage`).
   * Ledgers ສຳລັບ `LoyaltyTransaction` ແລະ `GiftCardTransaction` ປ້ອງກັນ Fraud.
   * ເພີ່ມ Enums ຄົບຖ້ວນ: `LoyaltyTier`, `AttendanceStatus`, `StockMovementType`, `GroupBookingStatus`, `QueueTicketStatus`, `CampaignType`.
   * Soft-delete (`deletedAt`, `isActive`) ຢູ່ `User`, `StaffProfile`, `Service`, `Branch`.
   * ຮອງຮັບ `AFFILIATE_PARTNER` ເຕັມຮູບແບບດ້ວຍ `AffiliateProfile` ແລະ `AffiliatePayout`.
   * Indexes ທີ່ຈຳເປັນຄົບຖ້ວນທຸກ Query Patterns.
   * ຂະຫຍາຍຍອດເງິນເປັນ `Decimal(16, 2)` ຮອງຮັບ LAK ຫຼັກສິບຕື້ ແລະ SaaS Annual Billing.
   * Multi-Tenant Isolation ດ້ວຍ `branchId` ຄົບທຸກຕາຕະລາງ.
   * `TreatmentPhoto[]` (ຮອງຮັບຫຼາຍຮູບ Before/After/Progress) ແລະ `medicalNotes` ເປັນ Optional.
   * Notification & Marketing Campaign Models (`NotificationLog`, `MarketingCampaign`, `CampaignRecipient`).
   * ລະບົບບັດຄິວ Walk-in (`QueueTicket`).
   * Prisma Schema Splitting ຮອງຮັບ `previewFeatures = ["prismaSchemaFolder"]`.
4. **D. Minor Point Alignments:**
   * Align `BotPlatform` (`WHATSAPP`, `LINE`, `MESSENGER`, `TELEGRAM`, `VOICE_AI`).
   * ຕາຕະລາງ `StaffBranch` ຮອງຮັບຊ່າງທີ່ປະຈຳການຫຼາຍສາຂາ.
   * ຜູກ `ConsentForm.serviceId` ເຂົ້າກັບ `Service`.
   * ລະບຸ Live GPS Tracking ຜ່ານ Redis Pub/Sub + WebSockets.

---

## 📦 1. ລາຍລະອຽດທັງໝົດ 38 ໂມດູນ (Renumbered 01 → 37 Sequential, + Module 38 ເພີ່ມພາຍຫຼັງ)

ລະບົບຖືກຈັດລຽງເລກໂມດູນ 1 ຫາ 37 ຢ່າງຕໍ່ເນື່ອງຕາມ 5 ໝວດໝູ່ໃຫຍ່:

### 🔴 ໝວດທີ 1: Core Foundation & Portals (ໂມດູນ 01 – 07)
* **Module 01: Authentication & Role-Based Access Control (RBAC)**
  * ເຂົ້າສູ່ລະບົບ, ລົງທະບຽນ, ຢືນຢັນຕົວຕົນດ້ວຍ JWT (Access + Refresh Token) ພ້ອມ `bcrypt` hashing.
  * ແບ່ງສິດ 4 ລະດັບ: `SUPER_ADMIN`, `BRANCH_ADMIN`, `STAFF`, `CUSTOMER` ພ້ອມ Route/API Guards.
* **Module 02: Service Catalog & Category Management**
  * ຈັດການໝວດໝູ່ ແລະ ລາຍການບໍລິການ (CRUD).
  * ກຳນົດລາຄາ, ຮູບ, **ໄລຍະເວລາ (Duration: 30, 45, 60, 90 ນາທີ)**, ແລະ Staff-Service Mapping.
* **Module 03: Staff Profile & Schedule Management**
  * ຈັດການໂປຣຟາຍພະນັກງານ: ຕຳແໜ່ງ, ຄວາມຊ່ຽວຊານ, ຮູບ, ຄະແນນດາວ.
  * ຕັ້ງຄ່າເວລາເຮັດວຽກປະຈຳວັນ (Working Hours): ເວລາເລີ່ມ-ເລີກ, ເວລາພັກ, ແລະ ລະບົບຂໍລາພັກ (Time-Off).
* **Module 04: Booking & Time Slot Engine (ຫົວໃຈຫຼັກຂອງລະບົບ)**
  * Algorithm ຄິດໄລ່ Available Slots ຕາມຊ່ວງເວລາເຮັດວຽກ ລົບກັບຄິວທີ່ຖືກຈອງແລ້ວ.
  * ປ້ອງກັນ Double-Booking ດ້ວຍ Database Row-level Locks ແລະ DateTime range checks (`startAt` / `endAt`).
* **Module 05: Customer Mobile App Portal (React Native Expo)**
  * ແອັບສຳລັບລູກຄ້າ: ຄົ້ນຫາບໍລິການ, ເລືອກຊ່າງ, Booking Wizard 3 ຂັ້ນຕອນ, ປະຫວັດນັດໝາຍ ແລະ ຣີວິວ.
* **Module 06: Staff Mobile App Portal (React Native Expo)**
  * ແອັບສຳລັບຊ່າງ: ເບິ່ງຕາຕະລາງງານປະຈຳວັນ (Timeline), ປຸ່ມອັບເດດສະຖານະຄິວ (*ກຳລັງເຮັດ → ສຳເລັດ*).
* **Module 07: Web Admin Dashboard & Master Calendar (React + Vite + Shadcn)**
  * ໜ້າຕ່າງຫຼັງບ້ານ: Stats Overview, Master Calendar ລວມທຸກຊ່າງ (Day/Week View), Drag-and-Drop, ເພີ່ມຄິວ Walk-in.

### 🟡 ໝວດທີ 2: Finance, Payments & Front-Desk Operations (ໂມດູນ 08 – 13)
* **Module 08: Payment Gateway, Split Tender & Deposits**
  * ຮອງຮັບ BCEL One QR Code, ບັດເຄຣດິດ Stripe, ເງິນສົດ. ຕັ້ງຄ່າເກັບມັດຈຳ 20%–50% ປ້ອງກັນ No-Show.
  * ຮອງຮັບ **Split Tender (PaymentTransaction)**: ຈ່າຍມັດຈຳ + ຄະແນນສະສົມ + ເງິນສົດ ໃນ 1 ບິນ.
* **Module 09: Staff Commission & Payroll Engine**
  * ຄິດໄລ່ % ຄ່າຄອມມິດຊັນຂອງຊ່າງຕາມແຕ່ລະບໍລິການ, ສະຫຼຸບຍອດ Real-time ໃນແອັບ, Export ເງິນເດືອນເປັນ Excel.
* **Module 10: QR Code Check-in & Walk-in Queue System**
  * ສະແກນ QR ໜ້າຮ້ານເພື່ອ Check-in ອັດຕະໂນມັດ, ລະບົບອອກບັດຄິວ (`QueueTicket`) ສຳລັບລູກຄ້າ Walk-in.
* **Module 11: Shop Expense & Profit/Loss (P&L) Accounting**
  * ບັນທຶກລາຍຈ່າຍຮ້ານ: ຄ່າເຊົ່າ, ຄ່ານ້ຳ-ໄຟ, ອຸປະກອນ, ເງິນເດືອນ. ລາຍງານກຳໄລ-ຂາດທຶນສຸດທິ (P&L Statement).
* **Module 12: Multi-Currency & Real-Time Exchange Rates**
  * ຮອງຮັບຫຼາຍສະກຸນເງິນ: **ກີບ (LAK), ບາດ (THB), ໂດລາ (USD)** ພ້ອມຕາຕະລາງ `ExchangeRate` ຄິດໄລ່ອັດຕາແລກປ່ຽນ.
* **Module 13: E-Gift Cards & Digital Voucher System**
  * ຊື້ບັດຂອງຂວັນດິຈິຕອນສົ່ງໃຫ້ໝູ່ຜ່ານແອັບ, ລະບົບ Ledger `GiftCardTransaction` ກວດສອບຍອດເງິນຄົງເຫຼືອ.

### 🟢 ໝວດທີ 3: Clinical Records, Consumables & Resource Allocation (ໂມດູນ 14 – 17)
* **Module 14: Inventory BOM & Stock Movement Ledger**
  * **Bill of Materials (BOM):** ກຳນົດວັດຖຸດິບຕໍ່ບໍລິການ (`ServiceConsumable`) ເພື່ອຕັດສະຕັອກອັດຕະໂນມັດເມື່ອເຮັດບໍລິການ.
  * **Stock Movement Ledger:** ບັນທຶກປະຫວັດການເຂົ້າ-ອອກຂອງສະຕັອກ (`StockMovement`) ກວດສອບຍ້ອນຫຼັງ ແລະ Rollback ໄດ້.
* **Module 15: Electronic Medical & Treatment Records (EMR)**
  * ບັນທຶກປະຫວັດການແພ້, ສູດສີ, ບັນທຶກອາການ (Optional Notes).
  * ຄັງຮູບພາບຫຼາຍໃບ (`TreatmentPhoto[]`) ແບ່ງປະເພດ: `BEFORE`, `AFTER`, `PROGRESS`.
* **Module 16: Digital Consent & E-Signature Forms**
  * ແບບຟອມຍິນຍອມຮັບການປິ່ນປົວທີ່ມີຄວາມສ່ຽງ ຜູກກັບ `serviceId`, ເຊັນລາຍເຊັນດິຈິຕອນຜ່ານແອັບມືຖື.
* **Module 17: Multi-Resource Allocation (Rooms & Equipment Locking)**
  * Lock ຊັບພະຍາກອນ 3 ຢ່າງພ້ອມກັນ: **[ຊ່າງ + ເວລາ + ຫ້ອງ/ຕຽງ + ເຄື່ອງມື]** ບໍ່ໃຫ້ຈອງຊົນກັນ.

### 🔵 ໝວດທີ 4: Customer Engagement, Packages & Smart Features (ໂມດູນ 18 – 24)
* **Module 18: Prepaid Packages & Multi-Service Course Sessions**
  * ຂາຍຄອສເໝົາຈ່າຍທີ່ຮອງຮັບຫຼາຍບໍລິການພ້ອມກັນ (`UserPackageItem`: ສິວ 10 ຄັ້ງ + ຕັດຜົມ 5 ຄັ້ງ).
  * ຜູກ `appointment.userPackageItemId` ເພື່ອຕັດຮອບຄອສອັດຕະໂນມັດເມື່ອມາໃຊ້ບໍລິການ.
* **Module 19: Loyalty Points Ledger, VIP Tiers & Coupons**
  * ລະບົບຄະແນນສະສົມພ້ອມ Ledger (`LoyaltyTransaction`), ລະດັບ VIP (`SILVER`, `GOLD`, `PLATINUM`), ຄູປອງໂປຣໂມຊັນ.
* **Module 20: Smart Waitlist Management & Backfill**
  * ເຂົ້າຄິວລໍຖ້າເມື່ອເວລາເຕັມ, BullMQ Worker ຈະແຈ້ງເຕືອນດຶງຄົນໃນ Waitlist ມາສຽບແທນທັນທີເມື່ອມີຄິວຍົກເລີກ.
* **Module 21: In-App Chat & Consultation Threads**
  * ລະບົບແຊັດແບບ Threaded (`Conversation` + `ConversationParticipant` + `ChatMessage`) ສົ່ງຮູບປຶກສາກ່ອນຈອງ.
* **Module 22: Group & Family Booking System**
  * ລະບົບຈອງພ້ອມກັນຫຼາຍຄົນ (`BookingGroup`): ຈັດສັນຊ່າງຫຼາຍຄົນໃນເວລາໃກ້ຄຽງກັນ ແຕ່ລວມບິນຈ່າຍເງິນອັນດຽວ.
* **Module 23: Automated Multi-Channel Notifications**
  * ແຈ້ງເຕືອນລ່ວງໜ້າ 24h ແລະ 1h ຜ່ານ Push Notification (Expo), SMS, ແລະ Email ດ້ວຍ BullMQ Queue.
* **Module 24: Automated CRM Marketing & Campaigns**
  * ແຄມເປນວັນເກີດ (Birthday Promo) ແລະ ແຄມເປນດຶງລູກຄ້າເກົ່າ (Win-back) ພ້ອມ `NotificationLog` ກັນສົ່ງຊ້ຳ.

### 🟣 ໝວດທີ 5: Enterprise, Multi-Tenant, Logistics & AI (ໂມດູນ 25 – 37)
* **Module 25: Multi-Branch Management & Tenant Isolation**
  * ຮອງຮັບຫຼາຍສາຂາ, ຕາຕະລາງ `StaffBranch` ຮອງຮັບຊ່າງເຮັດວຽກຫຼາຍສາຂາ, ແຍກຂໍ້ມູນດ້ວຍ `branchId` (Tenant Isolation).
* **Module 26: Staff Attendance & GPS Geofenced Check-in**
  * ລົງເວລາເຂົ້າ-ອອກວຽກຜ່ານມືຖື ພ້ອມກວດສອບພິກັດ GPS ຮ້ານ, ສະຖານະ `AttendanceStatus` (ON_TIME, LATE, OVERTIME).
* **Module 27: Multi-Language Support (i18n)**
  * ຮອງຮັບພາສາລາວ (LA), ໄທ (TH), ອັງກິດ (EN) ພ້ອມຟອນ Lao Unicode (Noto Sans/Serif Lao).
* **Module 28: AI Dynamic Pricing & Happy Hours**
  * ປັບຫຼຸດລາຄາອັດຕະໂນມັດໃນຊ່ວງເວລາທີ່ຄົນໜ້ອຍ (Happy Hours) ແລະ ປັບລາຄາຂຶ້ນໃນຊ່ວງ Peak Hours.
* **Module 29: On-Demand Home Service & Live GPS Stylist Tracking**
  * ບໍລິການເດລິເວີຣີ່ຊ່າງຮອດບ້ານ, ຕິດຕາມຕຳແໜ່ງຊ່າງແບບ Real-time ເທິງແຜນທີ່ຜ່ານ Redis Pub/Sub + WebSockets.
* **Module 30: AI Skin & Hair Camera Diagnostic Analysis**
  * ຖ່າຍຮູບຜິວ/ຜົມຜ່ານກ້ອງ, AI Computer Vision ວິເຄາະບັນຫາ ແລະ ແນະນຳຄອສຮັກສາທີ່ກົງຈຸດ.
* **Module 31: AR Virtual Try-On**
  * ລອງປ່ຽນສີຜົມ, ລອງຊົງຜົມ, ຫຼື ລອງສີເລັບເທິງໃບໜ້າສະເໝືອນຈິງດ້ວຍ Augmented Reality.
* **Module 32: B2B Supplier & Purchase Order (PO) Management**
  * ຈັດການຜູ້ສະໜອງວັດຖຸດິບ ແລະ ອອກໃບສັ່ງຊື້ (Purchase Order) ເມື່ອສະຕັອກຫຼຸດຮອດຈຸດຕ່ຳສຸດ.
* **Module 33: Customer Referral & Affiliate Partner Program**
  * ລະບົບ Referral Code ແນະນຳໝູ່ ແລະ ລະບົບຄ່ານາຍໜ້າ KOL/Influencer (`AffiliateProfile` + `AffiliatePayout`).
* **Module 34: Staff KPI, Leaderboard & Performance Bonuses**
  * Leaderboard ພະນັກງານດີເດັ່ນປະຈຳເດືອນ, ປະເມີນເປົ້າໝາຍລາຍຮັບ ແລະ ຄິດໄລ່ໂບນັດອັດຕະໂນມັດ.
* **Module 35: Omnichannel AI Voice & Chatbot Booking Bot**
  * AI Bot ເຊື່ອມຕໍ່ WhatsApp, LINE, Messenger, Telegram ຮັບຈອງຄິວ 24 ຊົ່ວໂມງ.
* **Module 36: Multi-Tenant SaaS Billing & Subscriptions**
  * ລະບົບເກັບຄ່າເຊົ່າໃຊ້ງານລະບົບລາຍເດືອນ (Starter, Pro, Enterprise) ສຳລັບການຂາຍລະບົບຕໍ່ໃຫ້ຄລີນິກອື່ນ.
* **Module 37: Audit Logging, Security & Data Privacy Compliance**
  * ບັນທຶກ Audit Log ທຸກການກະທຳສຳຄັນ, Data Encryption, ແລະ ມາດຕະຖານ HIPAA / GDPR.
* **Module 38: Platform-Wide Messaging (Staff, Customer & Cross-Branch Chat)**
  * ຕໍ່ຍອດ `Conversation`/`ConversationParticipant`/`ChatMessage` ຈາກ Module 21 ໃຫ້ຄອບຄຸມທຸກຄູ່ຜູ້ໃຊ້:
    ພະນັກງານ↔ພະນັກງານ (ຂ້າມສາຂາ), ລູກຄ້າ↔ພະນັກງານ/ສາຂາ (ຂ້າມສາຂາໄດ້ ບໍ່ຈຳກັດສະເພາະສາຂາທີ່ຈອງ), ແລະ
    ລູກຄ້າ↔ລູກຄ້າ; ໃຊ້ WebSocket/Redis Pub-Sub infra ດຽວກັນກັບ Module 29.

---

## 🗄️ 2. Master Database Schema (`schema.prisma` - PostgreSQL)

Schema ນີ້ຮອງຮັບ **Prisma Schema Folder (`prisma/schema/*.prisma`)** ໂດຍມີຕົວແບບຄົບຖ້ວນທັງ 37 ໂມດູນ:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["prismaSchemaFolder"]
}

// =========================================================================
// 1. ENUMS (ມາດຕະຖານລະບົບ)
// =========================================================================

enum UserRole {
  SUPER_ADMIN
  BRANCH_ADMIN
  STAFF
  CUSTOMER
  AFFILIATE_PARTNER
}

enum AppointmentStatus {
  PENDING
  CONFIRMED
  IN_PROGRESS
  COMPLETED
  CANCELLED
  NO_SHOW
}

enum ServiceDeliveryType {
  IN_STORE
  HOME_SERVICE
}

enum PaymentStatus {
  PENDING
  DEPOSIT_PAID
  FULLY_PAID
  REFUNDED
  FAILED
}

enum PaymentMethod {
  CASH
  BCEL_ONE_QR
  CREDIT_CARD
  GIFT_CARD
  PACKAGE_CREDIT
  LOYALTY_POINTS
}

enum GroupBookingStatus {
  PENDING
  CONFIRMED
  COMPLETED
  CANCELLED
}

enum LoyaltyTier {
  SILVER
  GOLD
  PLATINUM
}

enum LoyaltyTxType {
  EARN
  REDEEM
  EXPIRE
  ADJUST
}

enum AttendanceStatus {
  ON_TIME
  LATE
  OVERTIME
  ABSENT
}

enum StockMovementType {
  PURCHASE_IN
  SERVICE_CONSUMED
  ADJUSTMENT_ADD
  ADJUSTMENT_DEDUCT
  RETURN_TO_SUPPLIER
}

enum TreatmentPhotoType {
  BEFORE
  AFTER
  PROGRESS
}

enum QueueTicketStatus {
  WAITING
  CALLED
  IN_SERVICE
  COMPLETED
  CANCELLED
}

enum POStatus {
  DRAFT
  ORDERED
  RECEIVED
  CANCELLED
}

enum PayoutStatus {
  PENDING
  PROCESSING
  PAID
  REJECTED
}

enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELLED
  TRIAL
}

enum BotPlatform {
  WHATSAPP
  LINE
  MESSENGER
  TELEGRAM
  VOICE_AI
}

enum CampaignType {
  BIRTHDAY
  WIN_BACK
  FESTIVAL_PROMO
  CUSTOM
}

// =========================================================================
// 2. MULTI-TENANT, BRANCHES & CURRENCY (ໂມດູນ 12, 25, 36)
// =========================================================================

model Branch {
  id           String             @id @default(uuid())
  name         String
  address      String
  phone        String
  baseCurrency String             @default("LAK") // Base Currency
  latitude     Float?
  longitude    Float?
  isActive     Boolean            @default(true)
  deletedAt    DateTime?          // Soft-delete
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  users             User[]
  staffBranches     StaffBranch[]
  services          Service[]
  rooms             Room[]
  equipments        Equipment[]
  appointments      Appointment[]
  bookingGroups     BookingGroup[]
  payments          Payment[]
  inventories       Product[]
  expenses          Expense[]
  subscription      TenantSubscription?
  pricingRules      DynamicPricingRule[]
  purchaseOrders    PurchaseOrder[]
  stockMovements    StockMovement[]
  waitlists         Waitlist[]
  giftCards         GiftCard[]
  packages          Package[]
  conversations     Conversation[]
  queueTickets      QueueTicket[]
  campaigns         MarketingCampaign[]
  auditLogs         AuditLog[]

  @@map("branches")
}

model ExchangeRate {
  id             String   @id @default(uuid())
  baseCurrency   String   // "USD"
  targetCurrency String   // "LAK"
  rate           Decimal  @db.Decimal(12, 6)
  updatedAt      DateTime @updatedAt

  @@unique([baseCurrency, targetCurrency])
  @@map("exchange_rates")
}

model TenantSubscription {
  id                String             @id @default(uuid())
  branchId          String             @unique
  planName          String             // STARTER, PRO, ENTERPRISE
  status            SubscriptionStatus @default(ACTIVE)
  monthlyPrice      Decimal            @db.Decimal(16, 2)
  startDate         DateTime           @default(now())
  nextBillingDate   DateTime
  stripeCustomerId  String?
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  branch            Branch             @relation(fields: [branchId], references: [id], onDelete: Cascade)

  @@map("tenant_subscriptions")
}

// =========================================================================
// 3. USERS, ACCESS CONTROL & AFFILIATES (ໂມດູນ 01, 19, 33)
// =========================================================================

model User {
  id               String            @id @default(uuid())
  branchId         String?
  role             UserRole          @default(CUSTOMER)
  name             String
  email            String?           @unique
  phone            String            @unique
  password         String?
  avatarUrl        String?
  dateOfBirth      DateTime?
  expoPushToken    String?
  isActive         Boolean           @default(true)
  deletedAt        DateTime?         // Soft-delete
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  branch           Branch?           @relation(fields: [branchId], references: [id])
  staffProfile     StaffProfile?
  affiliateProfile AffiliateProfile?
  appointments     Appointment[]     @relation("CustomerAppointments")
  bookedGroups     BookingGroup[]    @relation("GroupPayer")
  loyaltyAccount   LoyaltyAccount?
  treatmentNotes   TreatmentRecord[]
  consentForms     ConsentForm[]
  reviews          Review[]
  userPackages     UserPackage[]
  skinAnalyses     SkinHairAnalysis[]
  referralCode     ReferralCode?
  usedReferrals    ReferralUsage[]   @relation("ReferredUser")
  purchasedCards   GiftCard[]        @relation("BuyerCards")
  redeemedCards    GiftCard[]        @relation("RedeemedCards")
  auditLogs        AuditLog[]
  waitlists        Waitlist[]
  chatParticipants ConversationParticipant[]
  sentMessages     ChatMessage[]     @relation("SentMessages")
  campaigns        CampaignRecipient[]
  notifications    NotificationLog[]

  @@index([phone, role])
  @@index([deletedAt])
  @@map("users")
}

model AffiliateProfile {
  id             String            @id @default(uuid())
  userId         String            @unique
  commissionRate Float             @default(0.10) // 10%
  totalEarnings  Decimal           @default(0.0) @db.Decimal(16, 2)
  unpaidBalance  Decimal           @default(0.0) @db.Decimal(16, 2)
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  user           User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  payouts        AffiliatePayout[]

  @@map("affiliate_profiles")
}

model AffiliatePayout {
  id                 String           @id @default(uuid())
  affiliateProfileId String
  amount             Decimal          @db.Decimal(16, 2)
  status             PayoutStatus     @default(PENDING)
  payoutMethod       String           // "BCEL_ONE", "BANK_TRANSFER"
  accountDetails     String
  paidAt             DateTime?
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt

  affiliateProfile   AffiliateProfile @relation(fields: [affiliateProfileId], references: [id], onDelete: Cascade)

  @@map("affiliate_payouts")
}

// =========================================================================
// 4. STAFF, WORKING HOURS, ATTENDANCE & KPI (ໂມດູນ 03, 09, 25, 26, 34)
// =========================================================================

model StaffProfile {
  id               String            @id @default(uuid())
  userId           String            @unique
  title            String            // ຊ່າງຕັດຜົມຊ່ຽວຊານ, ທັນຕະແພດ
  bio              String?
  commissionRate   Float             @default(0.0)
  rating           Float             @default(5.0)
  totalReviews     Int               @default(0)
  isActive         Boolean           @default(true)
  deletedAt        DateTime?         // Soft-delete
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  user             User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  staffBranches    StaffBranch[]
  workingHours     WorkingHour[]
  timeOffs         StaffTimeOff[]
  staffServices    StaffService[]
  appointments     Appointment[]     @relation("StaffAppointments")
  commissions      StaffCommission[]
  attendances      StaffAttendance[]
  kpiGoals         StaffKpiGoal[]

  @@map("staff_profiles")
}

model StaffBranch {
  id             String       @id @default(uuid())
  staffProfileId String
  branchId       String
  isPrimary      Boolean      @default(false)

  staffProfile   StaffProfile @relation(fields: [staffProfileId], references: [id], onDelete: Cascade)
  branch         Branch       @relation(fields: [branchId], references: [id], onDelete: Cascade)

  @@unique([staffProfileId, branchId])
  @@map("staff_branches")
}

model WorkingHour {
  id             String       @id @default(uuid())
  staffProfileId String
  dayOfWeek      Int          // 0=Sun, 1=Mon, ..., 6=Sat
  startTime      String       // Regex ^\d{2}:\d{2}$ ເຊັ່ນ "09:00"
  endTime        String       // "18:00"
  breakStartTime String?
  breakEndTime   String?
  isDayOff       Boolean      @default(false)
  updatedAt      DateTime     @updatedAt

  staffProfile   StaffProfile @relation(fields: [staffProfileId], references: [id], onDelete: Cascade)

  @@map("working_hours")
}

model StaffTimeOff {
  id             String       @id @default(uuid())
  staffProfileId String
  startDate      DateTime
  endDate        DateTime
  reason         String?
  isApproved     Boolean      @default(false)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  staffProfile   StaffProfile @relation(fields: [staffProfileId], references: [id], onDelete: Cascade)

  @@map("staff_time_offs")
}

model StaffAttendance {
  id             String           @id @default(uuid())
  staffProfileId String
  date           DateTime         @db.Date
  checkIn        DateTime
  checkOut       DateTime?
  latitude       Float?
  longitude      Float?
  status         AttendanceStatus @default(ON_TIME)
  createdAt      DateTime         @default(now())

  staffProfile   StaffProfile     @relation(fields: [staffProfileId], references: [id], onDelete: Cascade)

  @@map("staff_attendances")
}

model StaffKpiGoal {
  id             String       @id @default(uuid())
  staffProfileId String
  monthYear      String       // "2026-09"
  targetRevenue  Decimal      @db.Decimal(16, 2)
  actualRevenue  Decimal      @default(0.0) @db.Decimal(16, 2)
  bonusAmount    Decimal      @default(0.0) @db.Decimal(16, 2)
  isBonusPaid    Boolean      @default(false)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  staffProfile   StaffProfile @relation(fields: [staffProfileId], references: [id], onDelete: Cascade)

  @@map("staff_kpi_goals")
}

// =========================================================================
// 5. SERVICES, BOM & RESOURCE ALLOCATION (ໂມດູນ 02, 14, 17, 28)
// =========================================================================

model ServiceCategory {
  id          String    @id @default(uuid())
  name        String
  imageUrl    String?
  services    Service[]

  @@map("service_categories")
}

model Service {
  id              String              @id @default(uuid())
  categoryId      String
  branchId        String?
  name            String
  description     String?
  price           Decimal             @db.Decimal(16, 2)
  durationMinutes Int
  imageUrl        String?
  requireDeposit  Boolean             @default(false)
  depositAmount   Decimal?            @db.Decimal(16, 2)
  isActive        Boolean             @default(true)
  deletedAt       DateTime?           // Soft-delete
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  category        ServiceCategory     @relation(fields: [categoryId], references: [id])
  branch          Branch?             @relation(fields: [branchId], references: [id])
  staffServices   StaffService[]
  appointments    Appointment[]
  packageItems    PackageItem[]
  userPackageItems UserPackageItem[]
  pricingRules    DynamicPricingRule[]
  consumables     ServiceConsumable[] // BOM
  waitlists       Waitlist[]
  consentForms    ConsentForm[]
  queueTickets    QueueTicket[]

  @@index([branchId, isActive])
  @@map("services")
}

model ServiceConsumable {
  id         String   @id @default(uuid())
  serviceId  String
  productId  String
  qtyPerUse  Decimal  @db.Decimal(10, 3) // ຕັດສະຕັອກຕໍ່ການບໍລິການ 1 ຄັ້ງ

  service    Service  @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([serviceId, productId])
  @@map("service_consumables")
}

model StaffService {
  id             String       @id @default(uuid())
  staffProfileId String
  serviceId      String

  staffProfile   StaffProfile @relation(fields: [staffProfileId], references: [id], onDelete: Cascade)
  service        Service      @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  @@unique([staffProfileId, serviceId])
  @@map("staff_services")
}

model Room {
  id           String        @id @default(uuid())
  branchId     String
  name         String
  isAvailable  Boolean       @default(true)

  branch       Branch        @relation(fields: [branchId], references: [id])
  appointments Appointment[]

  @@map("rooms")
}

model Equipment {
  id           String        @id @default(uuid())
  branchId     String
  name         String
  code         String        @unique
  isAvailable  Boolean       @default(true)

  branch       Branch        @relation(fields: [branchId], references: [id])
  appointments Appointment[]

  @@map("equipments")
}

model DynamicPricingRule {
  id              String   @id @default(uuid())
  branchId        String
  serviceId       String?
  ruleName        String   // "Happy Hour", "Weekend Peak"
  dayOfWeek       Int      // 0-6
  startTime       String   // "13:00"
  endTime         String   // "15:00"
  discountPercent Float    @default(0.0)
  priceMultiplier Float    @default(1.0)
  isActive        Boolean  @default(true)

  branch          Branch   @relation(fields: [branchId], references: [id])
  service         Service? @relation(fields: [serviceId], references: [id])

  @@map("dynamic_pricing_rules")
}

// =========================================================================
// 6. APPOINTMENTS, GROUPS & ENGINE (ໂມດູນ 04, 18, 22, 29)
// =========================================================================

model BookingGroup {
  id           String             @id @default(uuid())
  branchId     String
  payerId      String             // ຜູ້ຈ່າຍເງິນຫຼັກ
  title        String?            // "Family Spa Day"
  totalAmount  Decimal            @db.Decimal(16, 2)
  currency     String             @default("LAK")
  status       GroupBookingStatus @default(CONFIRMED)
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  branch       Branch             @relation(fields: [branchId], references: [id])
  payer        User               @relation("GroupPayer", fields: [payerId], references: [id])
  appointments Appointment[]
  payments     Payment[]

  @@map("booking_groups")
}

model Appointment {
  id                String              @id @default(uuid())
  branchId          String
  customerId        String
  staffProfileId    String
  serviceId         String
  roomId            String?
  equipmentId       String?
  bookingGroupId    String?             // ຜູກກັບ BookingGroup (Module 22)
  userPackageItemId String?             // ຕັດຮອບຄອສ (Module 18)

  // ປ່ຽນເປັນ DateTime ເພື່ອເຮັດ Index Overlap Query ໄດ້ໄວ
  startAt           DateTime
  endAt             DateTime
  status            AppointmentStatus   @default(PENDING)
  deliveryType      ServiceDeliveryType @default(IN_STORE)

  // Home Service (Module 29)
  homeAddress       String?
  destLatitude      Float?
  destLongitude     Float?
  travelFee         Decimal             @default(0.0) @db.Decimal(16, 2)

  totalAmount       Decimal             @db.Decimal(16, 2)
  currency          String              @default("LAK")
  customerNotes     String?
  staffNotes        String?
  deletedAt         DateTime?           // Soft-delete
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  branch            Branch              @relation(fields: [branchId], references: [id])
  customer          User                @relation("CustomerAppointments", fields: [customerId], references: [id])
  staffProfile      StaffProfile        @relation("StaffAppointments", fields: [staffProfileId], references: [id])
  service           Service             @relation(fields: [serviceId], references: [id])
  room              Room?               @relation(fields: [roomId], references: [id])
  equipment         Equipment?          @relation(fields: [equipmentId], references: [id])
  bookingGroup      BookingGroup?       @relation(fields: [bookingGroupId], references: [id])
  userPackageItem   UserPackageItem?    @relation(fields: [userPackageItemId], references: [id])
  payment           Payment?
  review            Review?
  treatmentRecord   TreatmentRecord?
  commission        StaffCommission?

  // Index Overlap ທີ່ໄວທີ່ສຸດ (WHERE startAt < :end AND endAt > :start)
  @@index([staffProfileId, startAt, endAt])
  @@index([roomId, startAt, endAt])
  @@index([equipmentId, startAt, endAt])
  @@index([customerId])
  @@index([branchId, startAt])
  @@map("appointments")
}

model Waitlist {
  id             String   @id @default(uuid())
  branchId       String
  customerId     String
  serviceId      String
  preferredDate  DateTime @db.Date
  createdAt      DateTime @default(now())

  branch         Branch   @relation(fields: [branchId], references: [id])
  customer       User     @relation(fields: [customerId], references: [id], onDelete: Cascade)
  service        Service  @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  @@index([serviceId, preferredDate])
  @@map("waitlists")
}

model QueueTicket {
  id           String            @id @default(uuid())
  branchId     String
  serviceId    String?
  ticketNumber String            // "A-001"
  customerName String
  phone        String
  status       QueueTicketStatus @default(WAITING)
  calledAt     DateTime?
  completedAt  DateTime?
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt

  branch       Branch            @relation(fields: [branchId], references: [id])
  service      Service?          @relation(fields: [serviceId], references: [id])

  @@index([branchId, status, createdAt])
  @@map("queue_tickets")
}

// =========================================================================
// 7. PAYMENTS, SPLIT TENDER & COMMISSIONS (ໂມດູນ 08, 09, 13)
// =========================================================================

model Payment {
  id             String               @id @default(uuid())
  branchId       String
  appointmentId  String?              @unique
  bookingGroupId String?              // ຮອງຮັບການຈ່າຍເງິນແບບກຸ່ມ
  totalAmount    Decimal              @db.Decimal(16, 2)
  depositAmount  Decimal              @default(0.0) @db.Decimal(16, 2)
  currency       String               @default("LAK")
  paymentStatus  PaymentStatus        @default(PENDING)
  paidAt         DateTime?
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt

  branch         Branch               @relation(fields: [branchId], references: [id])
  appointment    Appointment?         @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  bookingGroup   BookingGroup?        @relation(fields: [bookingGroupId], references: [id])
  transactions   PaymentTransaction[] // Split tender lines

  @@index([paymentStatus, paidAt])
  @@map("payments")
}

model PaymentTransaction {
  id                String                 @id @default(uuid())
  paymentId         String
  method            PaymentMethod
  amount            Decimal                @db.Decimal(16, 2)
  currency          String                 @default("LAK")
  giftCardId        String?
  loyaltyAccountId  String?
  userPackageId     String?
  qrReference       String?                // BCEL One transaction reference
  status            String                 @default("SUCCESS")
  createdAt         DateTime               @default(now())

  payment           Payment                @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  giftCard          GiftCard?              @relation(fields: [giftCardId], references: [id])
  loyaltyAccount    LoyaltyAccount?        @relation(fields: [loyaltyAccountId], references: [id])
  userPackage       UserPackage?           @relation(fields: [userPackageId], references: [id])
  giftCardTxs       GiftCardTransaction[]
  loyaltyTxs        LoyaltyTransaction[]

  @@map("payment_transactions")
}

model StaffCommission {
  id             String       @id @default(uuid())
  staffProfileId String
  appointmentId  String       @unique
  serviceAmount  Decimal      @db.Decimal(16, 2)
  commissionRate Float
  payoutAmount   Decimal      @db.Decimal(16, 2)
  isPaid         Boolean      @default(false)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  staffProfile   StaffProfile @relation(fields: [staffProfileId], references: [id])
  appointment    Appointment  @relation(fields: [appointmentId], references: [id])

  @@map("staff_commissions")
}

model GiftCard {
  id                 String                @id @default(uuid())
  branchId           String
  code               String                @unique
  initialBalance     Decimal               @db.Decimal(16, 2)
  currentBalance     Decimal               @db.Decimal(16, 2)
  currency           String                @default("LAK")
  buyerId            String?
  redeemedByUserId   String?
  recipientEmail     String
  expireDate         DateTime
  isRedeemed         Boolean               @default(false)
  createdAt          DateTime              @default(now())
  updatedAt          DateTime              @updatedAt

  branch             Branch                @relation(fields: [branchId], references: [id])
  buyer              User?                 @relation("BuyerCards", fields: [buyerId], references: [id])
  redeemedBy         User?                 @relation("RedeemedCards", fields: [redeemedByUserId], references: [id])
  paymentTxs         PaymentTransaction[]
  transactions       GiftCardTransaction[]

  @@map("gift_cards")
}

model GiftCardTransaction {
  id                   String              @id @default(uuid())
  giftCardId           String
  paymentTransactionId String?
  amount               Decimal             @db.Decimal(16, 2)
  balanceAfter         Decimal             @db.Decimal(16, 2)
  createdAt            DateTime            @default(now())

  giftCard             GiftCard            @relation(fields: [giftCardId], references: [id], onDelete: Cascade)
  paymentTransaction   PaymentTransaction? @relation(fields: [paymentTransactionId], references: [id])

  @@map("gift_card_transactions")
}

// =========================================================================
// 8. LOYALTY, MULTI-SERVICE COURSES & REFERRALS (ໂມດູນ 18, 19, 33)
// =========================================================================

model LoyaltyAccount {
  id           String                @id @default(uuid())
  userId       String                @unique
  points       Int                   @default(0)
  tierLevel    LoyaltyTier           @default(SILVER)
  createdAt    DateTime              @default(now())
  updatedAt    DateTime              @updatedAt

  user         User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions LoyaltyTransaction[]
  paymentTxs   PaymentTransaction[]

  @@map("loyalty_accounts")
}

model LoyaltyTransaction {
  id                   String              @id @default(uuid())
  loyaltyAccountId     String
  paymentTransactionId String?
  points               Int
  type                 LoyaltyTxType
  refId                String?
  notes                String?
  createdAt            DateTime            @default(now())

  loyaltyAccount       LoyaltyAccount      @relation(fields: [loyaltyAccountId], references: [id], onDelete: Cascade)
  paymentTransaction   PaymentTransaction? @relation(fields: [paymentTransactionId], references: [id])

  @@map("loyalty_transactions")
}

model Package {
  id           String        @id @default(uuid())
  branchId     String
  name         String
  totalPrice   Decimal       @db.Decimal(16, 2)
  currency     String        @default("LAK")
  isActive     Boolean       @default(true)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  branch       Branch        @relation(fields: [branchId], references: [id])
  items        PackageItem[]
  userPackages UserPackage[]

  @@map("packages")
}

model PackageItem {
  id          String   @id @default(uuid())
  packageId   String
  serviceId   String
  totalUnits  Int

  package     Package  @relation(fields: [packageId], references: [id], onDelete: Cascade)
  service     Service  @relation(fields: [serviceId], references: [id])

  @@map("package_items")
}

model UserPackage {
  id           String            @id @default(uuid())
  userId       String
  packageId    String
  expireDate   DateTime
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt

  user         User              @relation(fields: [userId], references: [id])
  package      Package           @relation(fields: [packageId], references: [id])
  items        UserPackageItem[] // ແຍກຈຳນວນຄັ້ງຕາມແຕ່ລະບໍລິການ
  paymentTxs   PaymentTransaction[]

  @@map("user_packages")
}

model UserPackageItem {
  id             String        @id @default(uuid())
  userPackageId  String
  serviceId      String
  totalUnits     Int
  remainingUnits Int
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  userPackage    UserPackage   @relation(fields: [userPackageId], references: [id], onDelete: Cascade)
  service        Service       @relation(fields: [serviceId], references: [id])
  appointments   Appointment[]

  @@map("user_package_items")
}

model ReferralCode {
  id             String          @id @default(uuid())
  userId         String          @unique
  code           String          @unique
  discountAmount Decimal         @default(50000.0) @db.Decimal(16, 2)
  currency       String          @default("LAK")
  createdAt      DateTime        @default(now())

  user           User            @relation(fields: [userId], references: [id])
  usages         ReferralUsage[]

  @@map("referral_codes")
}

model ReferralUsage {
  id             String       @id @default(uuid())
  referralCodeId String
  referredUserId String
  appointmentId  String?
  rewardClaimed  Boolean      @default(false)
  createdAt      DateTime     @default(now())

  referralCode   ReferralCode @relation(fields: [referralCodeId], references: [id])
  referredUser   User         @relation("ReferredUser", fields: [referredUserId], references: [id])

  @@map("referral_usages")
}

// =========================================================================
// 9. CLINICAL EMR, MULTI-PHOTO, AI & CHAT (ໂມດູນ 15, 16, 21, 30, 35)
// =========================================================================

model TreatmentRecord {
  id            String           @id @default(uuid())
  appointmentId String           @unique
  customerId    String
  medicalNotes  String?          // Optional notes
  treatmentDate DateTime         @default(now())
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  appointment   Appointment      @relation(fields: [appointmentId], references: [id])
  customer      User             @relation(fields: [customerId], references: [id])
  photos        TreatmentPhoto[] // ຮອງຮັບຫຼາຍຮູບ Before/After/Progress

  @@map("treatment_records")
}

model TreatmentPhoto {
  id                String             @id @default(uuid())
  treatmentRecordId String
  photoUrl          String
  type              TreatmentPhotoType @default(PROGRESS)
  caption           String?
  createdAt         DateTime           @default(now())

  treatmentRecord   TreatmentRecord    @relation(fields: [treatmentRecordId], references: [id], onDelete: Cascade)

  @@map("treatment_photos")
}

model ConsentForm {
  id           String   @id @default(uuid())
  userId       String
  serviceId    String?  // ຜູກ relation ກັບ Service
  serviceName  String
  signatureUrl String
  signedAt     DateTime @default(now())

  user         User     @relation(fields: [userId], references: [id])
  service      Service? @relation(fields: [serviceId], references: [id])

  @@map("consent_forms")
}

model Review {
  id            String      @id @default(uuid())
  appointmentId String      @unique
  userId        String
  rating        Int
  comment       String?
  createdAt     DateTime    @default(now())

  appointment   Appointment @relation(fields: [appointmentId], references: [id])
  user          User        @relation(fields: [userId], references: [id])

  @@map("reviews")
}

model Conversation {
  id           String                    @id @default(uuid())
  branchId     String
  title        String?
  createdAt    DateTime                  @default(now())
  updatedAt    DateTime                  @updatedAt

  branch       Branch                    @relation(fields: [branchId], references: [id])
  participants ConversationParticipant[]
  messages     ChatMessage[]

  @@map("conversations")
}

model ConversationParticipant {
  id             String       @id @default(uuid())
  conversationId String
  userId         String
  joinedAt       DateTime     @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([conversationId, userId])
  @@map("conversation_participants")
}

model ChatMessage {
  id             String       @id @default(uuid())
  conversationId String
  senderId       String
  receiverId     String?
  message        String
  mediaUrl       String?
  isRead         Boolean      @default(false)
  createdAt      DateTime     @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender         User         @relation("SentMessages", fields: [senderId], references: [id])

  @@index([conversationId, createdAt])
  @@index([receiverId, isRead])
  @@map("chat_messages")
}

model SkinHairAnalysis {
  id                 String   @id @default(uuid())
  userId             String
  photoUrl           String
  analysisType       String   // "SKIN_ACNE", "HAIR_DAMAGE"
  detectedIssues     Json
  recommendedService Json
  createdAt          DateTime @default(now())

  user               User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("skin_hair_analyses")
}

model BotConversation {
  id             String      @id @default(uuid())
  platform       BotPlatform
  externalUserId String
  intentDetected String?
  extractedSlots Json?
  isResolved     Boolean     @default(false)
  createdAt      DateTime    @default(now())

  @@map("bot_conversations")
}

// =========================================================================
// 10. INVENTORY, BOM, B2B PO & AUDIT LOGS (ໂມດູນ 11, 14, 23, 24, 32, 37)
// =========================================================================

model Supplier {
  id             String          @id @default(uuid())
  name           String
  contactPerson  String?
  phone          String
  email          String?
  address        String?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  purchaseOrders PurchaseOrder[]

  @@map("suppliers")
}

model Product {
  id                 String              @id @default(uuid())
  branchId           String
  name               String
  sku                String              @unique
  stockQty           Int                 @default(0)
  minStockQty        Int                 @default(5)
  costPrice          Decimal             @db.Decimal(16, 2)
  unit               String              // ຫຼອດ, ກ່ອງ, ຊຸດ
  isActive           Boolean             @default(true)
  deletedAt          DateTime?           // Soft-delete
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  branch             Branch              @relation(fields: [branchId], references: [id])
  consumableServices ServiceConsumable[]
  purchaseOrderItems PurchaseOrderItem[]
  stockMovements     StockMovement[]

  @@index([branchId, stockQty])
  @@map("products")
}

model StockMovement {
  id           String            @id @default(uuid())
  branchId     String
  productId    String
  type         StockMovementType
  qty          Int               // ບວກ ຫຼື ລົບ
  balanceAfter Int
  refId        String?           // appointmentId ຫຼື poId
  notes        String?
  createdAt    DateTime          @default(now())

  branch       Branch            @relation(fields: [branchId], references: [id])
  product      Product           @relation(fields: [productId], references: [id])

  @@index([productId, createdAt])
  @@map("stock_movements")
}

model PurchaseOrder {
  id           String              @id @default(uuid())
  branchId     String
  supplierId   String
  poNumber     String              @unique
  totalAmount  Decimal             @db.Decimal(16, 2)
  status       POStatus            @default(DRAFT)
  orderDate    DateTime            @default(now())
  receivedDate DateTime?
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt

  branch       Branch              @relation(fields: [branchId], references: [id])
  supplier     Supplier            @relation(fields: [supplierId], references: [id])
  items        PurchaseOrderItem[]

  @@map("purchase_orders")
}

model PurchaseOrderItem {
  id              String        @id @default(uuid())
  purchaseOrderId String
  productId       String
  quantity        Int
  unitCost        Decimal       @db.Decimal(16, 2)

  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  product         Product       @relation(fields: [productId], references: [id])

  @@map("purchase_order_items")
}

model Expense {
  id          String   @id @default(uuid())
  branchId    String
  category    String   // ຄ່າເຊົ່າ, ຄ່າໄຟ, ອຸປະກອນ
  amount      Decimal  @db.Decimal(16, 2)
  currency    String   @default("LAK")
  expenseDate DateTime @db.Date
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  branch      Branch   @relation(fields: [branchId], references: [id])

  @@map("expenses")
}

model MarketingCampaign {
  id           String              @id @default(uuid())
  branchId     String
  name         String
  type         CampaignType
  discountCode String?
  triggerRule  Json?               // { "inactiveDays": 60, "birthMonth": true }
  isActive     Boolean             @default(true)
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt

  branch       Branch              @relation(fields: [branchId], references: [id])
  recipients   CampaignRecipient[]

  @@map("marketing_campaigns")
}

model CampaignRecipient {
  id          String            @id @default(uuid())
  campaignId  String
  userId      String
  status      String            // "SENT", "OPENED", "CONVERTED"
  sentAt      DateTime          @default(now())
  convertedAt DateTime?

  campaign    MarketingCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  user        User              @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([campaignId, userId])
  @@map("campaign_recipients")
}

model NotificationLog {
  id        String   @id @default(uuid())
  userId    String
  title     String
  body      String
  type      String   // "REMINDER_24H", "REMINDER_1H", "WAITLIST_AVAILABLE"
  isRead    Boolean  @default(false)
  sentAt    DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRead])
  @@map("notification_logs")
}

model AuditLog {
  id         String   @id @default(uuid())
  branchId   String?
  userId     String?
  action     String   // "UPDATE_PRICE", "VIEW_PATIENT_PHOTO", "EXPORT_CUSTOMER"
  entityName String   // "Appointment", "TreatmentRecord"
  entityId   String?
  oldValue   Json?
  newValue   Json?
  ipAddress  String?
  createdAt  DateTime @default(now())

  branch     Branch?  @relation(fields: [branchId], references: [id])
  user       User?    @relation(fields: [userId], references: [id])

  @@index([entityName, entityId])
  @@index([action, createdAt])
  @@map("audit_logs")
}
```

---

## 3. ໂຄງສ້າງໂຟນເດີມາດຕະຖານສາກົນ (Clean Architecture Monorepo)

```text
abcp/
│
├── .github/                             # CI/CD Workflows (lint, test, build per app)
├── docs/
│   ├── adr/                             # Architecture Decision Records (0001-monorepo.md ...)
│   └── api/                             # ຮູບ diagram, ERD export, flow ຕ່າງໆ
├── design.md                            # 📘 Design System Guidelines & Custom UI Rules
├── docker-compose.yml                   # Local PostgreSQL 16 + Redis 7
├── pnpm-workspace.yaml                  # Workspace globs: apps/*, packages/*
├── turbo.json                           # Task pipeline (dev, build, lint, test)
├── .env.example                         # Root-level shared env (ຖ້າມີ)
├── package.json                         # Root scripts: "dev:all": "turbo run dev"
│
├── packages/                            # 📦 Shared internal packages
│   ├── shared-types/                    # Zod schemas + inferred TS types (source of truth)
│   │   ├── src/
│   │   │   ├── auth.schema.ts
│   │   │   ├── appointment.schema.ts
│   │   │   ├── service.schema.ts
│   │   │   ├── enums.ts                 # Role, AppointmentStatus, PaymentStatus ...
│   │   │   └── index.ts
│   │   └── package.json
│   ├── config-eslint/                   # ESLint config ໃຊ້ຮ່ວມ
│   └── config-tsconfig/                 # tsconfig base ໃຊ້ຮ່ວມ (tsconfig.base.json)
│
├── apps/
│   │
│   ├── backend/                         # RESTful API (Express.js + TypeScript + Prisma)
│   │   ├── prisma/
│   │   │   ├── schema/                  # Prisma schema splitting (37 ໂມດູນ)
│   │   │   │   ├── schema.prisma        # datasource + generator
│   │   │   │   ├── auth.prisma          # User, AffiliateProfile, AffiliatePayout
│   │   │   │   ├── booking.prisma       # Appointment, BookingGroup, Waitlist, QueueTicket
│   │   │   │   ├── catalog.prisma       # Service, Category, ServiceConsumable, Branch, Room, Equipment
│   │   │   │   ├── staff.prisma         # StaffProfile, StaffBranch, WorkingHours, TimeOff, KPI
│   │   │   │   ├── inventory.prisma     # Product, StockMovement, Supplier, PurchaseOrder
│   │   │   │   ├── finance.prisma       # Payment, PaymentTransaction, Commission, GiftCard, Loyalty
│   │   │   │   ├── clinical.prisma      # TreatmentRecord, TreatmentPhoto, ConsentForm
│   │   │   │   └── system.prisma        # AuditLog, MarketingCampaign, NotificationLog, Conversation
│   │   │   ├── migrations/              # Database Migration History
│   │   │   └── seed.ts                  # Initial Data Seeder (Branches, Admin, Services, Staff)
│   │   ├── src/
│   │   │   ├── config/                  # Environment & connections (env.ts, database.ts, redis.ts, logger.ts)
│   │   │   ├── constants/               # Roles, Statuses, Error Codes
│   │   │   ├── modules/                 # 📦 Feature-based Domain Modules (37 ໂມດູນ)
│   │   │   ├── jobs/                    # ⚙️ Background jobs (BullMQ workers: reminder, waitlist, scheduler)
│   │   │   ├── mail/                    # Nodemailer / templates
│   │   │   ├── middlewares/             # authGuard, roleGuard, validateRequest, errorHandler, rateLimiter
│   │   │   ├── utils/                   # dateHelpers, tokenGenerator, logger
│   │   │   ├── app.ts                   # Express App setup & middleware registration
│   │   │   └── server.ts                # Server Bootstrap & Graceful Shutdown
│   │   ├── tests/                       # unit/ & integration/
│   │   ├── uploads/                     # Local file storage (dev) — .gitignore
│   │   ├── openapi.yaml                 # API contract
│   │   ├── Dockerfile
│   │   ├── jest.config.ts
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── web-admin/                       # 💻 Web Admin Portal (React + Vite + Tailwind + Shadcn)
│   │   ├── public/                      # Brand assets & Favicons
│   │   ├── src/
│   │   │   ├── assets/                  # Icons, illustration SVGs
│   │   │   ├── config/                  # env.ts, constants
│   │   │   ├── router/                  # Route definitions + ProtectedRoute
│   │   │   ├── components/              # ui/, layout/, shared/, modules/
│   │   │   ├── pages/                   # Dashboard, Calendar, Services, Staff, Finance, Settings
│   │   │   ├── services/                # Axios API Clients
│   │   │   ├── i18n/                    # setup + locales/lo.json, locales/en.json
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── .env.example
│   │   ├── tailwind.config.js
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── mobile/                          # 📱 Customer & Staff Mobile App (React Native Expo)
│       ├── src/
│       │   ├── assets/                  # fonts, images
│       │   ├── theme/                   # design tokens ຈາກ design.md
│       │   ├── navigation/              # Root Navigator, Customer Tabs, Staff Tabs
│       │   ├── screens/                 # Customer Screens & Staff Screens
│       │   ├── components/              # Custom luxury UI components
│       │   ├── services/                # Mobile Axios Client
│       │   ├── store/                   # State Management (Zustand)
│       │   └── i18n/                    # setup + locales/lo.json, locales/en.json
│       ├── .env.example
│       ├── tailwind.config.js           # NativeWind
│       ├── app.json
│       └── package.json
```

---

## 🎨 4. ຄູ່ມືການອອກແບບສະເພາະຕົວ (`design.md` Guidelines)

* **Theme Concept:** *"Neo-Luxury Wellness & Medical Aesthetic"* (ຄວາມລຽບຫຣູ, ສະອາດ, ໂປ່ງສະບາຍ, ໜ້າເຊື່ອຖື).
* **Color Palette Tokens:**
  * **Primary (Deep Plum / Amethyst):** `#4A154B` / `#6B21A8` (ສະແດງເຖິງຄວາມ Luxury & ພຣີມຽມ).
  * **Accent (Warm Champagne / Soft Gold):** `#D4AF37` / `#E2C799` (ໃຊ້ສຳລັບ Badge, ດາວຣີວິວ, ແລະ ປຸ່ມໄຮໄລ້).
  * **Background Neutral:** `#FAFAF9` (Off-white ນຸ່ມນວນຕາ, ບໍ່ແມ່ນຂາວຈ້າ).
  * **Surface/Cards:** `#FFFFFF` ພ້ອມເງົາລະດັບ `shadow-sm` ເຖິງ `shadow-md` ແບບ Subdued Diffusion.
* **Typography:**
  * Headings: Modern Serif / High-end Sans (Playfair Display ຫຼື Plus Jakarta Sans).
  * Body & UI: Inter / Plus Jakarta Sans.
  * **ໝາຍເຫດພາສາລາວ:** ເລືອກ font ທີ່ຮອງຮັບ Lao Unicode ຄົບ (Noto Sans Lao / Noto Serif Lao) ຄູ່ກັບ Latin font.
* **Micro-interactions:**
  * Smooth Hover Transitions (150ms – 200ms ease-out).
  * Active Slot Selection ດ້ວຍ Spring Animations ນຸ່ມນວນ.
  * Haptic Feedback ເວລາກົດເລືອກ Slot ເທິງ Mobile.

---

## 🚀 5. ແຜນແມ່ບົດການພັດທະນາ 8 ໄລຍະ (Roadmap)

### 🚩 Phase 0: Monorepo Bootstrap (ວາງ Skeleton Workspace)
1. `pnpm init` + `pnpm-workspace.yaml` (`apps/*`, `packages/*`).
2. ຕັ້ງ `turbo.json` (pipeline: `dev`, `build`, `lint`, `test`, `db:*`).
3. ສ້າງ `packages/config-tsconfig` + `packages/config-eslint` + `packages/shared-types` (Zod schemas & enums).
4. `docker-compose.yml`: PostgreSQL 16 + Redis 7 + healthchecks.
5. `.github/` workflow: install → lint → test → build.

### 🚩 Phase 1: ວາງຮາກຖານລະບົບ & Local Database Core (Backend Setup)
1. Setup Express.js TypeScript ໂຄງສ້າງແບບ Modular Domain (`config`, `middlewares`, `modules`, `jobs`).
2. ສ້າງ `prisma/schema/` (schema splitting) ຮອງຮັບ 37 ໂມດູນ ພ້ອມ Run `prisma migrate dev`.
3. ນິຍາມ Zod schema/enums ໃນ `packages/shared-types` ແລ້ວ import ເຂົ້າ backend.
4. ຂຽນ Seed Script (`prisma/seed.ts`): ສາຂາຕົວຢ່າງ, ບັນຊີ Admin, ລາຍການບໍລິການ, ຊ່າງ, BOM consumables.
5. ພັດທະນາລະບົບ Auth (JWT access + refresh, Password Hashing, Role Guards).
6. ພັດທະນາ **Booking Slot Engine**: Algorithm ຄິດໄລ່ Available Slots ທີ່ປ້ອງກັນການຈອງຊ້ອນ (DateTime range checks + row-level locks).
7. Setup BullMQ queue registry (`src/jobs/queues.ts`) + worker bootstrap.
8. Setup `storage` module (local disk adapter) + `openapi.yaml` skeleton.

### 🚩 Phase 2: ໜ້າຫຼັງບ້ານ Web Admin Portal (React + Vite + Shadcn) ⬅️ *ເຮັດກ່ອນ*
1. Setup React (Vite) + TailwindCSS + Shadcn UI ພ້ອມ Theme Tokens ຈາກ `design.md`; setup `i18n/` (lo/en).
2. ສ້າງ `router/` + `ProtectedRoute` + Admin Authentication (Login & Session Storage).
3. ສ້າງ **Dashboard Overview Screen**: Stats Cards (ຍອດຈອງ, ລາຍຮັບ, ຄິວມື້ນີ້) + Chart ຍອດຂາຍ.
4. ສ້າງ **Master Calendar View**: Day/Week View ສະແດງຄິວຂອງຊ່າງທຸກຄົນ.
5. ສ້າງໜ້າ **CRUD Services & Categories**: ເພີ່ມ, ແກ້ໄຂ, ລົບ ບໍລິການ ແລະ ຕັ້ງຄ່າ BOM consumables.
6. ສ້າງໜ້າ **Staff & Working Hours Management**: ຈັດການຊ່າງ, ກຳນົດເວລາເຂົ້າ-ອອກວຽກ, ວັນພັກ, ສາຂາປະຈຳ.
7. ສ້າງຟອມ **Add Walk-in Appointment** ພ້ອມລະບົບອອກບັດຄິວ (`QueueTicket`).

### 🚩 Phase 3: ໜ້າບ້ານລູກຄ້າ Mobile App (Customer React Native Flow)
1. Setup React Native (Expo) + NativeWind + `theme/` + `i18n/` ໂດຍອີງ `design.md`.
2. ສ້າງໜ້າ **Home Screen**: Banner ໂປຣໂມຊັນ, ໝວດໝູ່ບໍລິການ, ບໍລິການຍອດນິຍົມ.
3. ສ້າງ **Booking Wizard (3-Step Flow)**: ເລືອກບໍລິການ + ຊ່າງ → ເລືອກວັນ/ເວລາ → ສະຫຼຸບ ແລະ ຢືນຢັນ.
4. ເຊື່ອມຕໍ່ API ກັບ Backend (types ຈາກ `shared-types`).
5. ສ້າງໜ້າ **My Appointments**: ຄິວນັດໝາຍ, ປະຫວັດ, ຍົກເລີກ/ເລື່ອນນັດ.

### 🚩 Phase 4: ໜ້າຕ່າງພະນັກງານ (Staff Mobile Portal & Attendance)
1. **Staff Schedule Screen**: ຄິວວຽກປະຈຳວັນ, ລາຍຊື່ລູກຄ້າ, ບໍລິການທີ່ຕ້ອງເຮັດ.
2. ປຸ່ມອັບເດດສະຖານະຄິວ: *ກຳລັງບໍລິການ → ສຳເລັດ*.
3. **GPS Attendance**: ລົງເວລາເຂົ້າ-ອອກ ພ້ອມກວດພິກັດຮ້ານ.
4. **Treatment Records**: ບັນທຶກໝາຍເຫດລູກຄ້າ ແລະ ອັບໂຫລດຮູບ Before/After/Progress ຜ່ານ `storage` module.
5. Staff Commission Summary.

### 🚩 Phase 5: ການເງິນ, ການຕະຫຼາດ & ການແຈ້ງເຕືອນ (Finance & Marketing)
1. ລະບົບຊຳລະເງິນ: Split tender (`PaymentTransaction`), ວາງເງິນມັດຈຳ (BCEL One Mock QR & Stripe Gateway).
2. **Push Notifications (Expo Notifications)** ຜ່ານ `jobs/reminder.job.ts`: ແຈ້ງລ່ວງໜ້າ 24h ແລະ 1h.
3. ລະບົບສະສົມຄະແນນ (Loyalty Points Ledger & VIP Tiers) ແລະ E-Gift Cards.
4. **Smart Waitlist** (`jobs/waitlist.job.ts`): ແຈ້ງຄົນລໍຖ້າເມື່ອມີຄິວຍົກເລີກ.
5. **QR Check-in ໜ້າຮ້ານ & ບັດຄິວ Walk-in**.

> **ໝາຍເຫດ (2026-09-10):** Phase 6 ເດີມ ("ຟັງຊັນລະດັບສູງ, AI & Multi-Tenant SaaS") ຖືກແຍກອອກເປັນ
> **Phase 6** (ປິດວຽກ Operations & Inventory — ຄວາມສ່ຽງຕ່ຳ, ບໍ່ມີ infra ໃໝ່, ຈຳເປັນຕໍ່ການ operate ຮ້ານ)
> ແລະ **Phase 7** (Revenue, AI & ການຄ້າ — ຄວາມສ່ຽງ/ຄວາມພະຍາຍາມສູງ, ຂຶ້ນກັບພາກສ່ວນນອກ). ເກນຈັດ:
> (A) ຕ້ອງ infra ໃໝ່ບໍ່ · (B) ຜູກ booking/payment core ຫຼາຍປານໃດ · (C) dependency ພາຍນອກ (SDK ຈ່າຍເງິນ,
> API ພາກສ່ວນທີ 3, ML) · (D) ຈຳເປັນຕໍ່ການ operate ຮ້ານ ຫຼື growth/showcase · (E) reuse pattern ທີ່ມີແລ້ວ
> (loyalty ledger / commission / dashboard stats) · (F) ຖອນຄືນງ່າຍປານໃດ.

### 🚩 Phase 6: ປິດວຽກ Operations & Inventory (Modules 14, 32, 37, 34)
> ທັງໝົດ backend-CRUD, reuse pattern ທີ່ມີແລ້ວ, **ບໍ່ມີ infra ໃໝ່**, schema models ມີພ້ອມແລ້ວ.
1. **B2B Suppliers & Purchase Orders** (Module 32) — CRUD `Supplier`, ອອກ PO (`PurchaseOrder` /
   `PurchaseOrderItem`), ຮັບເຄື່ອງເຂົ້າ → `StockMovement` (`PURCHASE_IN`). schema ພ້ອມແລ້ວໃນ `inventory.prisma`.
2. **Inventory BOM & Stock Deduction** (Module 14) — ເມື່ອ appointment ສຳເລັດ ຕັດສະຕັອກຕາມ
   `ServiceConsumable` ອັດຕະໂນມັດ, ບັນທຶກ `StockMovement` (`SERVICE_CONSUMED`, `balanceAfter`),
   ໜ້າຈໍ Inventory ໃນ web-admin (ປັດຈຸບັນ = ComingSoon "Phase 6"), ການປັບສະຕັອກດ້ວຍມື + ແຈ້ງເຕືອນ min-stock.
   ແກ້ໜີ້ຄ້າງ: BOM editor ຝັ່ງ web-admin ຍັງໃຊ້ synthetic `prod-N` id — ຕ້ອງຜູກກັບ `Product` uuid ຈິງ.
3. **Audit Logs & Security** (Module 37) — middleware ຝັ່ງ backend ຂຽນ `AuditLog` ທຸກການກະທຳສຳຄັນ
   (`oldValue`/`newValue`), ຕໍ່ກັບ `AuditLogPage` ທີ່ web-admin ມີແລ້ວ (ປັດຈຸບັນ mock). Data encryption at rest.
4. **Staff KPI, Leaderboard & Bonuses** (Module 34) — ໃຫ້ຈົບຈາກ M09: `StaffKpiGoal` ຕໍ່ເດືອນ,
   leaderboard (dashboard ມີ `staffLeaderboard` ແລ້ວ), ຄິດໄລ່ໂບນັດອັດຕະໂນມັດ, commission `isPaid` toggle +
   payroll export (Excel).

### 🚩 Phase 7: Revenue, AI & ການຄ້າ (Modules 28, 33, 29, 30, 31, 35, 36)
> ຄວາມສ່ຽງ/ຄວາມພະຍາຍາມສູງຂຶ້ນ; ບາງໂຕຕ້ອງ infra ໃໝ່ ຫຼື ຂຶ້ນກັບພາກສ່ວນນອກ. ເຮັດເປັນຄື້ນ 7A → 7B → 7C.

**Phase 7A — Revenue (ຄວາມສ່ຽງກາງ, ບໍ່ມີ infra ໃໝ່, reuse ສູງ):**
1. **Dynamic Pricing / Happy Hours** (Module 28) — `DynamicPricingRule` (schema ພ້ອມ) ເປັນ
   **rules engine ກ່ອນ** (ຊ່ວງເວລາ × % ຫຼຸດ/ເພີ່ມ); ML ຄ່ອຍຕໍ່ພາຍຫຼັງ.
2. **Referral & Affiliate Program** (Module 33) — Referral code + KOL/influencer (`AffiliateProfile` +
   `AffiliatePayout`); reuse pattern loyalty ledger + `StaffCommission` ໂດຍກົງ.

**Phase 7B — Infra ໃໝ່ (WebSocket / Redis Pub-Sub — ໃຊ້ຊ້ຳໄດ້ໃນ M21 chat, M35 chatbot):**
3. **On-Demand Home Service + Live GPS Tracking** (Module 29) — ບໍລິການຊ່າງຮອດບ້ານ, ຕິດຕາມ
   ຕຳແໜ່ງຊ່າງ real-time ຜ່ານ Redis Pub/Sub + WebSockets. ນີ້ຄືການລົງທຶນ infra ໃໝ່ຄັ້ງທຳອິດ — ເຮັດສຸດທ້າຍຂອງ 7B.

**Phase 7C — ເດີມພັນໃຫຍ່ / ພາກສ່ວນນອກ / pivot ທຸລະກິດ (ຕັດສິນໃຈແຍກ, ບໍ່ຄວນເລີ່ມຈົນກວ່າ 6 + 7A/7B ຈົບ):**
4. **AI Skin & Hair Camera Analysis** (Module 30) — Computer Vision / ML ຫຼື vendor; ຕ້ອງ pipeline ຮູບ + model.
5. **AR Virtual Try-On** (Module 31) — vendor AR SDK (ສ່ວນຫຼາຍເສຍເງິນ), mobile-heavy, leaf feature.
6. **Omnichannel AI Voice & Chatbot Booking** (Module 35) — WhatsApp/LINE/Messenger/Telegram; ແຕ່ລະ
   channel = ບັນຊີທຸລະກິດ + ການ verify + webhook infra. ຖ້າຈຳເປັນ ເລີ່ມ **1 channel** (LINE/Telegram) ເປັນ pilot.
7. **Multi-Tenant SaaS Billing & Subscriptions** (Module 36) — **ເຮັດຕໍ່ເມື່ອມີແຜນຂາຍລະບົບຕໍ່ໃຫ້ຄລີນິກອື່ນ
   ຈິງເທົ່ານັ້ນ.** `TenantSubscription` model ມີໄວ້ແລ້ວ ແຕ່ຕ້ອງ audit tenant isolation (`branchId`) ທຸກ query +
   billing gateway + tenant provisioning ກ່ອນ — ວຽກ cross-cutting ໃຫຍ່ກວ່າ feature ໃດໆ ໃນ list ນີ້.

### 🚩 Phase 8: Platform-Wide Messaging (Module 38)
> ຕໍ່ຍອດຈາກ Module 21 (In-App Chat & Consultation Threads, ຢູ່ 7C.2 — ຈຳກັດສະເພາະ ລູກຄ້າ↔ພະນັກງານ ກ່ອນຈອງ,
> ຜູກກັບ 1 ສາຂາ) ໃຫ້ກາຍເປັນລະບົບແຊັດລະດັບ platform ຄອບຄຸມທຸກຄູ່ຜູ້ໃຊ້ ແລະ ຂ້າມສາຂາໄດ້. **ຫ້າມສູນເສຍຟັງຊັນເດີມ
> ຂອງ M21 ແມ່ນແຕ່ຢ່າງດຽວ** — pre-booking consultation thread (ສົ່ງຮູບປຶກສາກ່ອນຈອງ, ຜູກກັບ branch/service)
> ຕ້ອງຍັງໃຊ້ງານໄດ້ຄືເກົ່າ ພຽງແຕ່ກາຍເປັນ **1 ໃນ 3 ປະເພດ conversation** ຂອງ Module 38. ຕ້ອງເຮັດ **ຫຼັງ 7B**
> (ໃຊ້ Redis Pub/Sub + WebSocket infra ດຽວກັນກັບ Module 29) ແລະ **ຫຼັງ 7C.2** (ຂະຫຍາຍ schema ທີ່ມີຢູ່ແລ້ວ
> ແທນທີ່ຈະສ້າງໃໝ່).

#### 8.1 Schema ຂະຫຍາຍ (migration, ບໍ່ແມ່ນສ້າງໃໝ່)

`Conversation`/`ConversationParticipant`/`ChatMessage` ທີ່ມີແລ້ວ (ເບິ່ງ §2 Master Schema) ຕ້ອງແກ້ດັ່ງນີ້:

```prisma
enum ConversationType {
  CONSULTATION   // = M21 ເດີມ: ລູກຄ້າ↔ພະນັກງານ, ຜູກ service/booking, ສົ່ງຮູບປຶກສາກ່ອນຈອງ
  STAFF_INTERNAL // ພະນັກງານ↔ພະນັກງານ ຂ້າມສາຂາ
  DIRECT         // ລູກຄ້າ↔ລູກຄ້າ 1-ຕໍ່-1
}

model Conversation {
  id             String                    @id @default(uuid())
  type           ConversationType          @default(CONSULTATION)
  branchId       String?                   // ✏️ ປ່ຽນຈາກ required → optional (null = ຂ້າມສາຂາ/DIRECT)
  serviceId      String?                   // ✏️ ໃໝ່: ຜູກ service ສະເພາະ CONSULTATION (M21 use-case)
  appointmentId  String?                   // ✏️ ໃໝ່: ຜູກ appointment ຖ້າແຊັດຫຼັງຈອງແລ້ວ
  title          String?
  isLocked       Boolean                   @default(false) // ✏️ ໃໝ່: admin ປິດຫ້ອງແຊັດ (moderation)
  createdAt      DateTime                  @default(now())
  updatedAt      DateTime                  @updatedAt

  branch         Branch?                   @relation(fields: [branchId], references: [id])
  service        Service?                  @relation(fields: [serviceId], references: [id])
  appointment    Appointment?              @relation(fields: [appointmentId], references: [id])
  participants   ConversationParticipant[]
  messages       ChatMessage[]

  @@index([type])
  @@map("conversations")
}

model ChatMessage {
  // ... field ເກົ່າຄືເດີມ (id, conversationId, senderId, receiverId, message, mediaUrl, isRead, createdAt)
  messageType    String   @default("TEXT") // ✏️ ໃໝ່: "TEXT" | "IMAGE" | "SYSTEM" (join/leave/lock events)
  deletedAt      DateTime?                 // ✏️ ໃໝ່: soft-delete ສຳລັບ moderation (ບໍ່ລຶບຖາວອນ, ເພື່ອ audit)
}

model ChatReport {                          // ✏️ ໃໝ່: ຈຳເປັນສະເພາະ DIRECT (customer↔customer)
  id             String   @id @default(uuid())
  conversationId String
  messageId      String?
  reportedById   String
  reason         String
  status         String   @default("PENDING") // PENDING | REVIEWED | ACTIONED
  createdAt      DateTime @default(now())

  @@index([status])
  @@map("chat_reports")
}

model ChatBlock {                           // ✏️ ໃໝ່: ສະເພາະ DIRECT — block ບໍ່ໃຫ້ອີກຝ່າຍທັກໄດ້
  id            String   @id @default(uuid())
  blockerId     String
  blockedId     String
  createdAt     DateTime @default(now())

  @@unique([blockerId, blockedId])
  @@map("chat_blocks")
}
```

`ConversationParticipant` ໂຄງສ້າງເກົ່າພໍໃຊ້ໄດ້ຄືເດີມ (ບໍ່ຕ້ອງແກ້) — ຄວາມສາມາດຂ້າມສາຂາມາຈາກ `Conversation.branchId`
ເປັນ optional, ບໍ່ແມ່ນຈາກ participant.

#### 8.2 ຟັງຊັນຕາມປະເພດ conversation

1. **CONSULTATION — ລູກຄ້າ↔ພະນັກງານ/ສາຂາ (= M21 ເດີມ + ຂະຫຍາຍຂ້າມສາຂາ)**
   - ຄົງທຸກຟັງຊັນເດີມ: threaded chat, ສົ່ງຮູບ (`mediaUrl`) ປຶກສາກ່ອນຈອງ, ຜູກ `serviceId`/`appointmentId`.
   - ໃໝ່: ລູກຄ້າເລືອກສາຂາ/ພະນັກງານທີ່ຈະແຊັດນຳໄດ້ ບໍ່ຈຳກັດສະເພາະສາຂາທີ່ເຄີຍຈອງ (`branchId` ຢູ່ conversation
     ອາດຕ່າງຈາກ home branch ຂອງລູກຄ້າ).
   - "ເລີ່ມແຊັດຈາກໜ້າ Service Detail / Staff Profile" ຄືເດີມ (entry point ບໍ່ປ່ຽນ).
   - ປິດຫ້ອງອັດຕະໂນມັດ (`isLocked`) ຫຼັງ appointment `COMPLETED`/`CANCELLED` ເກີນ N ວັນ (config), ຍັງເປີດອ່ານໄດ້.
2. **STAFF_INTERNAL — ພະນັກງານ↔ພະນັກງານ ຂ້າມສາຂາ**
   - 1-ຕໍ່-1 ຫຼືກຸ່ມ (ນຳໃຊ້ `ConversationParticipant` ຫຼາຍແຖວຄືເດີມ, ບໍ່ຕ້ອງເພີ່ມ field).
   - ຄົ້ນຫາ/ເລືອກພະນັກງານຈາກທຸກສາຂາ (reuse `GET /staff` + `branchId` filter ທີ່ມີແລ້ວ).
   - Directory ຂອງ conversation ທີ່ເຄີຍລົມ (recent chats list), ຄືກັບໜ້າ chat list ທົ່ວໄປ.
   - ບໍ່ຮອງຮັບ `ChatReport`/`ChatBlock` (ພະນັກງານພາຍໃນອົງກອນ — moderation ຜ່ານ admin/HR ໂດຍກົງ ບໍ່ແມ່ນ self-service).
3. **DIRECT — ລູກຄ້າ↔ລູກຄ້າ**
   - 1-ຕໍ່-1 ເທົ່ານັ້ນ (ບໍ່ຮອງຮັບກຸ່ມໃນ wave ທຳອິດ).
   - **Report** (`ChatReport`) — ລູກຄ້າ report ຂໍ້ຄວາມ/ຫ້ອງແຊັດ, ຂຶ້ນ queue ໃຫ້ admin ທົບທວນ (reuse
     `AuditLogPage` pattern ຫຼືໜ້າໃໝ່ `/settings/chat-moderation`).
   - **Block** (`ChatBlock`) — block ແລ້ວອີກຝ່າຍສົ່ງຂໍ້ຄວາມບໍ່ໄດ້ (check ກ່ອນສ້າງ `ChatMessage`), ບໍ່ເຫັນ online status.
   - **Rate limit** ການສ້າງ conversation ໃໝ່ (ກັນ spam) — reuse pattern ຂອງ `authLimiter`.
   - Opt-in ເທົ່ານັ້ນ: `User` ຕ້ອງເປີດ setting "ອະນຸຍາດໃຫ້ລູກຄ້າອື່ນທັກໄດ້" ກ່ອນ (default ປິດ) — ຫຼຸດຄວາມສ່ຽງ
     abuse ໂດຍບໍ່ຕ້ອງລໍຖ້າ report ກ່ອນ.

#### 8.3 API surface (ຂະຫຍາຍ, ບໍ່ແທນທີ່ M21 routes)

- `GET /conversations?type=&branchId=` — list ຫ້ອງແຊັດຂອງຕົນເອງ, filter ຕາມ type (reuse pagination pattern).
- `POST /conversations` — ສ້າງໃໝ່ (`type`, `participantIds[]`, ບົ່ງ `serviceId`/`appointmentId` ຖ້າ CONSULTATION).
- `GET /conversations/:id/messages` + `POST /conversations/:id/messages` — ຄືເດີມ, ບວກ `messageType`.
- `WS /ws/chat` — socket.io namespace ດຽວກັບ Module 29 (`typing`, `message:new`, `read`, `conversation:locked` events).
- `POST /conversations/:id/report` (DIRECT only), `POST /users/:id/block` / `DELETE /users/:id/block`.
- `PATCH /conversations/:id/lock` — admin-only, ໃຊ້ moderation.

#### 8.4 ຄວາມສ່ຽງ & ລຳດັບ wave ແນະນຳ

- ຄວາມສ່ຽງ moderation (DIRECT) ສູງກວ່າ feature ອື່ນໃນ Phase 7/8 ຍ້ອນເປັນ user-generated content ລະຫວ່າງ
  ບຸກຄົນພາຍນອກ (abuse/spam/harassment).
- **ລຳດັບແນະນຳ:** 8A = schema migration (type/nullable branchId ບໍ່ທຳລາຍ M21 ຂໍ້ມູນເກົ່າ, backfill
  `type=CONSULTATION` ໃຫ້ row ເກົ່າ) → 8B = STAFF_INTERNAL (ຄວາມສ່ຽງຕ່ຳສຸດ, internal users ເທົ່ານັ້ນ) →
  8C = ຂະຫຍາຍ CONSULTATION ໃຫ້ຂ້າມສາຂາ → 8D = DIRECT (customer↔customer, ຕ້ອງມີ report/block/opt-in ພ້ອມກ່ອນ
  ປ່ອຍ, ຄວນຕັດສິນໃຈຫຼັງເຫັນການໃຊ້ງານຈິງຂອງ 8A–8C ກ່ອນ).
- `audit-log` (M37) ຕ້ອງບັນທຶກ `conversation:locked`, `chat:report`, `chat:block` ເປັນ action ໃໝ່.
- `notification` (M23) ຕ້ອງຮອງຮັບ push ຂ້າມສາຂາ (ປັດຈຸບັນ notification job ອາດ scope ຕາມ branch ຂອງຜູ້ຮັບ —
  ຕ້ອງກວດວ່າບໍ່ blocked ໂດຍ branch-filter logic ທີ່ມີຢູ່).

---

## 🧪 6. ແຜນການທົດສອບ (Verification Plan)

### Automated Tests
* **Backend Unit & Integration Tests (Jest + Supertest)** — layout ຢູ່ `apps/backend/tests/`:
  - `unit/`: Slot Calculation Engine (startAt/endAt overlap query, ພັກທ່ຽງ, ວັນພັກ, Race Condition), utils.
  - `integration/`: Auth Flow (Register, Login, Token Expiry, Refresh, Role Guards) ດ້ວຍ test DB.
* **Shared-types Tests:** ກວດ Zod schema parse/refine ຖືກຕ້ອງ (regex validation ສຳລັບເວລາ "09:00").
* **Database Tests:** Prisma Cascade Deletes, Foreign Key Constraints, ແລະ Index Performance ເທິງ Local PostgreSQL.
* **CI:** `turbo run lint test build` ໃນ `.github/` ທຸກ PR.

### Manual Verification Flows
* **End-to-End User Flow (Web Admin → Backend → Mobile App):**
  1. Admin ສ້າງສາຂາ, ບໍລິການ (ພ້ອມ BOM), ແລະ ກຳນົດເວລາເຮັດວຽກຂອງຊ່າງເທິງ Web Admin.
  2. Admin ລອງເພີ່ມຄິວ Walk-in ຫຼື Group Booking ເທິງ Master Calendar.
  3. ກວດ API Slot Engine ວ່າເວລາທີ່ຖືກຈອງແລ້ວຈະບໍ່ໂຊເປັນເວລາວ່າງອີກ.
  4. ລູກຄ້າຈອງຄິວຜ່ານ Mobile App → ຂໍ້ມູນປາກົດເທິງ Web Admin ທັນທີ.
  5. ກວດ background job: reminder ຖືກ enqueue ຕອນຈອງ ແລະ waitlist notify ຕອນຍົກເລີກ.
  6. ກວດ Inventory: ເມື່ອ appointment ສຳເລັດ -> `StockMovement` ບັນທຶກການຕັດສະຕັອກຕາມ BOM ອັດຕະໂນມັດ.
