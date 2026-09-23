import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme';
import { AppointmentDetailScreen } from '../screens/appointments/AppointmentDetailScreen';
import { ChatScreen } from '../screens/appointments/ChatScreen';
import { CheckInScreen } from '../screens/appointments/CheckInScreen';
import { HomeServiceTrackingScreen } from '../screens/appointments/HomeServiceTrackingScreen';
import { BookingSuccessScreen } from '../screens/booking/BookingSuccessScreen';
import { WizardConfirmScreen } from '../screens/booking/WizardConfirmScreen';
import { WizardDateTimeScreen } from '../screens/booking/WizardDateTimeScreen';
import { WizardServiceScreen } from '../screens/booking/WizardServiceScreen';
import { ServiceDetailScreen } from '../screens/catalog/ServiceDetailScreen';
import { ServiceListScreen } from '../screens/catalog/ServiceListScreen';
import { PaymentScreen } from '../screens/booking/PaymentScreen';
import { GiftCardsScreen } from '../screens/profile/GiftCardsScreen';
import { GiftCardCheckoutScreen } from '../screens/profile/GiftCardCheckoutScreen';
import { MyPackagesScreen } from '../screens/packages/MyPackagesScreen';
import { PackageCheckoutScreen } from '../screens/packages/PackageCheckoutScreen';
import { PackageDetailScreen } from '../screens/packages/PackageDetailScreen';
import { PackagesScreen } from '../screens/packages/PackagesScreen';
import { LoyaltyScreen } from '../screens/profile/LoyaltyScreen';
import { ReferralScreen } from '../screens/profile/ReferralScreen';
import { NotificationPreferencesScreen } from '../screens/profile/NotificationPreferencesScreen';
import { SkinAnalysisScreen } from '../screens/profile/SkinAnalysisScreen';
import { DirectMessagesScreen } from '../screens/messaging/DirectMessagesScreen';
import { DirectThreadScreen } from '../screens/messaging/DirectThreadScreen';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';
import type { AppStackParamList } from './types';
import { TabsNavigator } from './TabsNavigator';

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Tabs" component={TabsNavigator} />
      <Stack.Screen name="ServiceList" component={ServiceListScreen} />
      <Stack.Screen name="ServiceDetail" component={ServiceDetailScreen} />
      <Stack.Group screenOptions={{ presentation: 'card' }}>
        <Stack.Screen name="WizardService" component={WizardServiceScreen} />
        <Stack.Screen name="WizardDateTime" component={WizardDateTimeScreen} />
        <Stack.Screen name="WizardConfirm" component={WizardConfirmScreen} />
      </Stack.Group>
      <Stack.Screen
        name="BookingSuccess"
        component={BookingSuccessScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="AppointmentDetail" component={AppointmentDetailScreen} />
      <Stack.Screen name="HomeServiceTracking" component={HomeServiceTrackingScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen
        name="CheckIn"
        component={CheckInScreen}
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="Payment" component={PaymentScreen} />
      <Stack.Screen name="Loyalty" component={LoyaltyScreen} />
      <Stack.Screen name="GiftCards" component={GiftCardsScreen} />
      <Stack.Screen name="GiftCardCheckout" component={GiftCardCheckoutScreen} />
      <Stack.Screen name="Packages" component={PackagesScreen} />
      <Stack.Screen name="PackageDetail" component={PackageDetailScreen} />
      <Stack.Screen
        name="PackageCheckout"
        component={PackageCheckoutScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="MyPackages" component={MyPackagesScreen} />
      <Stack.Screen name="Referral" component={ReferralScreen} />
      <Stack.Screen name="SkinAnalysis" component={SkinAnalysisScreen} />
      <Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} />
      <Stack.Screen name="DirectMessages" component={DirectMessagesScreen} />
      <Stack.Screen name="DirectThread" component={DirectThreadScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}
