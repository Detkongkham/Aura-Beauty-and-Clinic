import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { ConversationListScreen } from '../screens/staff/ConversationListScreen';
import { StaffAttendanceScreen } from '../screens/staff/StaffAttendanceScreen';
import { StaffEarningsScreen } from '../screens/staff/StaffEarningsScreen';
import { StaffProfileScreen } from '../screens/staff/StaffProfileScreen';
import { StaffTodayScreen } from '../screens/staff/StaffTodayScreen';
import { TabBar } from './TabBar';
import type { StaffTabsParamList } from './types';

const Tab = createBottomTabNavigator<StaffTabsParamList>();

export function StaffTabsNavigator(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen
        name="TodayTab"
        component={StaffTodayScreen}
        options={{ title: t('staffPortal.tabs.today') }}
      />
      <Tab.Screen
        name="AttendanceTab"
        component={StaffAttendanceScreen}
        options={{ title: t('staffPortal.tabs.attendance') }}
      />
      <Tab.Screen
        name="EarningsTab"
        component={StaffEarningsScreen}
        options={{ title: t('staffPortal.tabs.earnings') }}
      />
      <Tab.Screen
        name="MessagesTab"
        component={ConversationListScreen}
        options={{ title: t('staffPortal.tabs.messages') }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={StaffProfileScreen}
        options={{ title: t('staffPortal.tabs.profile') }}
      />
    </Tab.Navigator>
  );
}
