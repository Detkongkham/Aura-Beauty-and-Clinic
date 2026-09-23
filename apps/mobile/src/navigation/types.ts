import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingMode } from '../store/booking-draft.store';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type TabsParamList = {
  HomeTab: undefined;
  AppointmentsTab: undefined;
  ProfileTab: undefined;
};

export type AppStackParamList = {
  Tabs: undefined;
  ServiceList: { categoryId?: string; q?: string } | undefined;
  ServiceDetail: { serviceId: string };
  WizardService: undefined;
  WizardDateTime: undefined;
  WizardConfirm: undefined;
  BookingSuccess: { mode: BookingMode; appointmentId?: string };
  AppointmentDetail: { id: string };
  HomeServiceTracking: { appointmentId: string };
  Chat: { appointmentId: string };
  CheckIn: { appointmentId: string };
  Payment: { appointmentId: string };
  Loyalty: undefined;
  GiftCards: undefined;
  GiftCardCheckout: { paymentId: string; amount: number; code: string };
  Packages: { serviceId?: string } | undefined;
  PackageDetail: { packageId: string };
  PackageCheckout: { paymentId: string; amount: number; packageName: string };
  MyPackages: undefined;
  Referral: undefined;
  SkinAnalysis: undefined;
  DirectMessages: undefined;
  Notifications: undefined;
  NotificationPreferences: undefined;
  DirectThread: { threadId: string; title: string; locked?: boolean };
};

// ---- Staff Portal (Phase 4 / Module 06) --------------------------------

export type StaffTabsParamList = {
  TodayTab: undefined;
  AttendanceTab: undefined;
  EarningsTab: undefined;
  MessagesTab: undefined;
  ProfileTab: undefined;
};

export type StaffStackParamList = {
  StaffTabs: undefined;
  StaffAppointmentDetail: { id: string };
  TreatmentRecord: { appointmentId: string; customerName: string };
  StaffActiveTrip: { appointmentId: string; customerPhone?: string };
  StaffThread: { threadId: string; title: string; locked?: boolean };
  StaffSlipInbox: undefined;
  StaffSlipReview: { slipId: string };
};

export type StaffAppScreenProps<T extends keyof StaffStackParamList> = NativeStackScreenProps<
  StaffStackParamList,
  T
>;

export type StaffTabScreenProps<T extends keyof StaffTabsParamList> = CompositeScreenProps<
  BottomTabScreenProps<StaffTabsParamList, T>,
  NativeStackScreenProps<StaffStackParamList>
>;

export type AuthScreenProps<T extends keyof AuthStackParamList> = NativeStackScreenProps<
  AuthStackParamList,
  T
>;

export type AppScreenProps<T extends keyof AppStackParamList> = NativeStackScreenProps<
  AppStackParamList,
  T
>;

export type TabScreenProps<T extends keyof TabsParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabsParamList, T>,
  NativeStackScreenProps<AppStackParamList>
>;
