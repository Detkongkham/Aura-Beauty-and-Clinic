import { RouterProvider } from 'react-router-dom';

import { useSessionBootstrap } from '@/features/auth/useSessionBootstrap';
import { router } from '@/router';

export default function App() {
  useSessionBootstrap();
  return <RouterProvider router={router} />;
}
