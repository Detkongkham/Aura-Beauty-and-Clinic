import { useEffect } from 'react';
import { useMarkConversationRead } from './messaging.api';

/**
 * ບັນທຶກວ່າອ່ານແລ້ວຕອນເປີດຫ້ອງ ແລະ ຕອນອອກຈາກຫ້ອງ (ຂໍ້ຄວາມທີ່ມາລະຫວ່າງເປີດຢູ່ກໍຖືວ່າອ່ານແລ້ວ), ເພື່ອໃຫ້
 * unread badge ໃນ inbox ຖືກຕ້ອງ. ລະຫວ່າງເປີດຢູ່ ໜ້າຈໍ emit `chat:read` ທາງ socket ເອງ (server ບັນທຶກ cursor ດຽວກັນ).
 */
export function useThreadReadSync(threadId: string): void {
  const markRead = useMarkConversationRead();
  useEffect(() => {
    markRead.mutate(threadId);
    return () => markRead.mutate(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per thread
  }, [threadId]);
}
