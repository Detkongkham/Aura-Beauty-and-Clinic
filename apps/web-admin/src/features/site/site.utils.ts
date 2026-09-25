import {
  Flower2,
  Gift,
  HeartHandshake,
  Home,
  Microscope,
  Package,
  Scissors,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Sun,
  UserPlus,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import type { ServiceIcon } from './siteContent';

export const SERVICE_ICONS: Record<ServiceIcon, LucideIcon> = {
  facial: Sparkles,
  skin: Microscope,
  laser: Zap,
  body: Waves,
  hair: Scissors,
  spa: Flower2,
};

export const PILLAR_ICONS: Record<'shield' | 'doctor' | 'tech' | 'heart', LucideIcon> = {
  shield: ShieldCheck,
  doctor: Stethoscope,
  tech: Sun,
  heart: HeartHandshake,
};

export const EXTRA_ICONS: Record<'package' | 'gift' | 'referral' | 'home', LucideIcon> = {
  package: Package,
  gift: Gift,
  referral: UserPlus,
  home: Home,
};

export function initials(name: string) {
  return name
    .replace(/^(ດຣ\.|Dr\.|ນາງ|ທ່ານ)\s*/u, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => Array.from(p)[0] ?? '')
    .join('');
}
