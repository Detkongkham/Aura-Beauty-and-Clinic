import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** ຕິດຕາມ "Reduce Motion" ຂອງ OS — motion ທັງໝົດຕ້ອງເຄົາລົບຄ່ານີ້. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
