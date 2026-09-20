import type { AdminUser } from '@abcp/shared-types';

import { Badge } from '@/components/ui/badge';
import { RoleIcon } from '@/features/users/RoleIcon';

/** Role pill — uses the admin-configured roleName/roleColor/roleIcon when set, else falls back to the raw tier. */
export function RoleBadge({ user }: { user: Pick<AdminUser, 'role' | 'roleName' | 'roleColor' | 'roleIcon'> }) {
  if (user.roleName && user.roleColor) {
    return (
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ background: `${user.roleColor}1a`, color: user.roleColor }}
      >
        {user.roleIcon ? <RoleIcon icon={user.roleIcon} className="h-3 w-3" /> : null}
        {user.roleName}
      </span>
    );
  }
  return (
    <Badge variant={user.role === 'SUPER_ADMIN' ? 'primary' : 'neutral'} className="whitespace-nowrap">
      {user.role}
    </Badge>
  );
}
