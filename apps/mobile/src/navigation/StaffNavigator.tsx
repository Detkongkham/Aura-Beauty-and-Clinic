import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme';
import { StaffActiveTripScreen } from '../screens/staff/StaffActiveTripScreen';
import { StaffAppointmentDetailScreen } from '../screens/staff/StaffAppointmentDetailScreen';
import { StaffSlipInboxScreen } from '../screens/staff/StaffSlipInboxScreen';
import { StaffSlipReviewScreen } from '../screens/staff/StaffSlipReviewScreen';
import { StaffThreadScreen } from '../screens/staff/StaffThreadScreen';
import { TreatmentRecordScreen } from '../screens/staff/TreatmentRecordScreen';
import { StockAdjustScreen } from '../screens/staff/stock/StockAdjustScreen';
import { StockCountScreen } from '../screens/staff/stock/StockCountScreen';
import { StockCountsScreen } from '../screens/staff/stock/StockCountsScreen';
import { StockHomeScreen } from '../screens/staff/stock/StockHomeScreen';
import { StockProductScreen } from '../screens/staff/stock/StockProductScreen';
import { StockReceiveListScreen } from '../screens/staff/stock/StockReceiveListScreen';
import { StockReceiveScreen } from '../screens/staff/stock/StockReceiveScreen';
import { StockScanScreen } from '../screens/staff/stock/StockScanScreen';
import { useInventoryAccess } from '../features/inventory/inventory.api';
import { StaffTabsNavigator } from './StaffTabsNavigator';
import type { StaffStackParamList } from './types';

const Stack = createNativeStackNavigator<StaffStackParamList>();

/** Staff Mobile Portal (Phase 4) — root stack ສຳລັບ user ທີ່ role = STAFF. */
export function StaffNavigator(): React.JSX.Element {
  // M14 — ໜ້າສະຕັອກລົງທະບຽນສະເພາະຜູ້ມີ inventory:view (ສິດຖືກຖອນ → ເສັ້ນທາງຫາຍໄປນຳ)
  const { canView: canStock } = useInventoryAccess();
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
      {canStock ? (
        <Stack.Group>
          <Stack.Screen name="StockHome" component={StockHomeScreen} />
          <Stack.Screen
            name="StockScan"
            component={StockScanScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'fullScreenModal' }}
          />
          <Stack.Screen name="StockProduct" component={StockProductScreen} />
          <Stack.Screen name="StockCounts" component={StockCountsScreen} />
          <Stack.Screen name="StockCount" component={StockCountScreen} />
          <Stack.Screen name="StockReceiveList" component={StockReceiveListScreen} />
          <Stack.Screen name="StockReceive" component={StockReceiveScreen} />
          <Stack.Screen name="StockAdjust" component={StockAdjustScreen} />
        </Stack.Group>
      ) : null}
    </Stack.Navigator>
  );
}
