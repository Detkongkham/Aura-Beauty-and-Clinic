import type { ChatMessageView } from '@abcp/shared-types';
import { ImageOff } from 'lucide-react';
import { useState } from 'react';

import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** Bubbles stay well short of the panel edge — short line lengths read easier and leave the
 * avatar gutter (when shown) room to breathe instead of the two competing for space. */
const BUBBLE_MAX_WIDTH = 'max-w-[70%]';
/** Width reserved for the sender avatar/gutter — matches `PersonAvatar` size below. */
const AVATAR_GUTTER = 30;

/**
 * ໜຶ່ງກ້ອນຂໍ້ຄວາມ — TEXT/IMAGE/AUDIO. ໃຊ້ຮ່ວມກັນລະຫວ່າງ `ChatPanel` (M21 appointment chat) ແລະ
 * `ThreadView` (M38 STAFF_INTERNAL/DIRECT) ບໍ່ໃຫ້ code ຊ້ຳກັນ — ຄືກັນກັບ mobile `ChatBubble`, ຊື່ງ
 * backend ເປີດ `mediaUrl`/`messageType` ໃຫ້ຢູ່ແລ້ວແຕ່ web-admin ຍັງບໍ່ໄດ້ນຳໃຊ້ (debt ຈາກ Wave 8's
 * chat media attachments — mobile-only scope ຕອນນັ້ນ). `onError` ໃສ່ໄວ້ຢ້ານ `<img>` ໂຫຼດບໍ່ຂຶ້ນ (URL
 * ຜິດ, ໄຟລ໌ຖືກລຶບ) ແລ້ວປະລົງເປັນຊ່ອງຫວ່າງໆບໍ່ມີຫຍັງໃຫ້ເຫັນເລີຍ — ຄາຍເປັນ caption bubble ແທນສະເໝີ.
 *
 * `showMeta`/`isGroupStart`/`isGroupEnd` let the caller (`ThreadView`) collapse a run of
 * consecutive messages from the same sender into one visual group — tighter spacing between
 * them, name+time only under the last bubble, and the corner nearest the neighbour squared off
 * so the group reads as one shape instead of N identical pills.
 *
 * `showAvatar` (opt-in — `ChatPanel`'s 1:1 appointment chat leaves it off, `ThreadView`'s
 * multi-person threads turn it on) reserves a fixed gutter on the "their" side and renders the
 * sender's face on the last bubble of each group, so bubbles stay left-aligned within a group
 * instead of jumping around as the avatar appears/disappears per message.
 */
export function ChatMessageBubble({
  message,
  mine,
  showMeta = true,
  isGroupStart = true,
  isGroupEnd = true,
  showAvatar = false,
  highlight,
  focused = false,
}: {
  message: ChatMessageView;
  mine: boolean;
  showMeta?: boolean;
  isGroupStart?: boolean;
  isGroupEnd?: boolean;
  showAvatar?: boolean;
  /** In-thread search term to mark inside text bubbles. */
  highlight?: string;
  /** This bubble is the current search hit — gets a ring so it stands out from other hits. */
  focused?: boolean;
}) {
  const tailCorner = mine
    ? isGroupEnd
      ? 'rounded-br-md'
      : 'rounded-br-2xl'
    : isGroupEnd
      ? 'rounded-bl-md'
      : 'rounded-bl-2xl';
  const bubbleClass = cn(
    BUBBLE_MAX_WIDTH,
    'whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm shadow-sm transition-shadow duration-200',
    tailCorner,
    focused && 'ring-2 ring-amber-400 ring-offset-2 ring-offset-background',
    mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
  );

  let content: React.ReactNode;
  if (message.messageType === 'IMAGE' && message.mediaUrl) {
    content = <ImageContent url={message.mediaUrl} caption={message.body} bubbleClass={bubbleClass} />;
  } else if (message.messageType === 'AUDIO' && message.mediaUrl) {
    content = (
      <div className={cn(BUBBLE_MAX_WIDTH, 'flex min-w-0 flex-col gap-1 rounded-2xl bg-muted/60 p-2', tailCorner)}>
        <audio controls src={message.mediaUrl} className="h-9 w-64 max-w-full" />
        {message.body ? <span className="px-1 text-xs text-muted-foreground">{message.body}</span> : null}
      </div>
    );
  } else {
    content = <div className={bubbleClass}>{highlight ? <Highlighted text={message.body} term={highlight} /> : message.body}</div>;
  }

  const column = (
    <div className={cn('flex min-w-0 flex-1 flex-col gap-0.5', mine ? 'items-end' : 'items-start')}>
      {content}
      {showMeta ? (
        <span className="px-1 text-[11px] text-muted-foreground">
          {!mine ? <span className="font-medium text-foreground/70">{message.senderName}</span> : null}
          {!mine ? ' · ' : null}
          <DateTimeText value={message.createdAt} mode="time" />
        </span>
      ) : null}
    </div>
  );

  return (
    // `w-full` (not `self-end`/shrink-to-fit) keeps this row's width definite, so the bubble's
    // percentage-based `max-w-[70%]` below resolves against it correctly — a shrink-to-fit row
    // makes that percentage circular (row sizes from content, content caps itself as % of row)
    // and the browser was clipping the bubble instead of wrapping it. `flex-row-reverse` does the
    // right-alignment for "mine" bubbles instead, packing content at the row's reversed start.
    <div
      className={cn(
        'flex w-full items-end gap-2',
        mine ? 'flex-row-reverse' : 'flex-row',
        isGroupStart ? 'mt-4' : 'mt-1',
      )}
    >
      {showAvatar && !mine ? (
        isGroupEnd ? (
          <PersonAvatar name={message.senderName} size={AVATAR_GUTTER} className="mb-4 shrink-0" />
        ) : (
          <span className="shrink-0" style={{ width: AVATAR_GUTTER }} aria-hidden="true" />
        )
      ) : null}
      {column}
    </div>
  );
}

function Highlighted({ text, term }: { text: string; term: string }) {
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(needle);
  while (needle && at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded bg-amber-300 px-0.5 text-amber-950">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

function ImageContent({
  url,
  caption,
  bubbleClass,
}: {
  url: string;
  caption: string;
  bubbleClass: string;
}) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  if (failed) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={cn(bubbleClass, 'flex items-center gap-2')}>
        <ImageOff className="h-4 w-4 shrink-0" aria-hidden="true" />
        {caption}
      </a>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('block', BUBBLE_MAX_WIDTH)}>
        <img
          src={url}
          alt={caption}
          className="max-h-64 rounded-lg border border-border object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">{caption}</DialogTitle>
          <img src={url} alt={caption} className="max-h-[85vh] w-full rounded-lg object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
