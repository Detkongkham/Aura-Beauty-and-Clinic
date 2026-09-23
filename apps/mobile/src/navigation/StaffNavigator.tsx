import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme';
import { StaffActiveTripScreen } from '../screens/staff/StaffActiveTripScreen';
import { StaffAppointmentDetailScreen } from '../screens/staff/StaffAppointmentDetailScreen';
import { StaffSlipInboxScreen } from '../screens/staff/StaffSlipInboxScreen';
import { StaffSlipReviewScreen } from '../screens/staff/StaffSlipReviewScreen';
import { StaffThreadScreen } from '../screens/staff/StaffThreadScreen';
import { TreatmentRecordScreen } from '../screens/staff/TreatmentRecordScreen';
import { StaffTabsNavigator } from './StaffTabsNavigator';
import type { StaffStackParamList } from './types';

const Stack = createNativeStackNavigator<StaffStackParamList>();

/** Staff Mobile Portal (Phase 4) — root stack ສຳລັບ user ທີ່ role = STAFF. */
export function StaffNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="StaffTabs" component={StaffTabsNavigator} />
      <Stack.Screen name="StaffAppointmentDetail" component={StaffAppointmentDetailScreen} />
      <Stack.Screen name="TreatmentRecord" component={TreatmentRecordScreen} />
      <Stack.Screen name="StaffActiveTrip" component={StaffActiveTripScreen} />
      <Stack.Screen name="StaffThread" component={StaffThreadScreen} />
      <Stack.Screen name="StaffSlipInbox" component={StaffSlipInboxScreen} />
      <Stack.Screen name="StaffSlipReview" component={StaffSlipReviewScreen} />
    </Stack.Navigator>
  );
}
