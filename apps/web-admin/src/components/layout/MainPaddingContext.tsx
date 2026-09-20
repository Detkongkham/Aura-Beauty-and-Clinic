import { createContext, useContext } from 'react';

/**
 * Lets `StickyPageHeader` tell `AppShell` to drop `<main>`'s top padding while
 * it's mounted. `<main>`'s padding can't be cancelled with a negative
 * `margin-top` on the sticky header the way its horizontal padding is:
 * `position: sticky` boxes don't use their own margin (or any ancestor's)
 * when computing their in-flow position — verified in an isolated,
 * framework-free HTML/CSS repro, so it's a genuine browser behaviour, not a
 * Tailwind/React quirk. Removing the padding at the source is the only
 * reliable fix; this context is how the header reaches `<main>` to do it.
 *
 * Registration is ref-counted (returns an unregister function) rather than a
 * plain boolean setter so that during a route transition, where the outgoing
 * page's cleanup can run after the incoming page's effect, one sticky header
 * unmounting can't clobber another one's padding-removal request.
 */
export const RegisterStickyHeaderContext = createContext<(() => () => void) | null>(null);

export function useRegisterStickyHeader(): () => () => void {
  const register = useContext(RegisterStickyHeaderContext);
  return register ?? (() => () => {});
}
