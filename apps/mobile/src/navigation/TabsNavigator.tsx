import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { AppointmentsScreen } from '../screens/appointments/AppointmentsScreen';
import { HomeScreen } from '../screens/home/HomeScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { TabBar } from './TabBar';
import type { TabsParamList } from './types';

const Tab = createBottomTabNavigator<TabsParamList>();

export function TabsNavigator(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: t('tabs.home') }} />
      <Tab.Screen
        name="AppointmentsTab"
        component={AppointmentsScreen}
        options={{ title: t('tabs.appointments') }}
      />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: t('tabs.profile') }} />
    </Tab.Navigator>
  );
}
