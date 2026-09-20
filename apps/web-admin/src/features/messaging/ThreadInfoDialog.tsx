import type { ConversationListItem } from '@abcp/shared-types';
import { Briefcase, Building2, Calendar, ChevronLeft, ChevronRight, Mail, Phone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DateTimeText } from '@/components/shared/DateTimeText';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useStaffList } from '@/features/staff/staff.api';
import { cn } from '@/lib/utils';

type Participant = ConversationListItem['participants'][number];

/**
 * "Info" panel opened by tapping the thread header — a group shows a tappable member list, a
 * 1:1 thread jumps straight to that person's card. Cross-references `GET /staff?q=` by name to
 * enrich the bare `{id, name, role}` conversation participant with job title/branch/contact —
 * STAFF_INTERNAL participants without a `StaffProfile` (a BRANCH_ADMIN/SUPER_ADMIN, say) just
 * fall back to name + role, no error shown for the expected "no match" case. Deliberately leaves
 * out `commissionRate` — internal-only compensation data that any staff member happening across
 * a colleague's contact card shouldn't see, even though the same `GET /staff` response carries it.
 */
export function ThreadInfoDialog({
  open,
  onOpenChange,
  others,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  others: Participant[];
}) {
  const isGroup = others.length > 1;
  const [viewing, setViewing] = useState<Participant | null>(others.length === 1 ? (others[0] ?? null) : null);

  useEffect(() => {
    if (open) setViewing(others.length === 1 ? (others[0] ?? null) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
        {viewing ? (
          <ParticipantDetail participant={viewing} onBack={isGroup ? () => setViewing(null) : undefined} />
        ) : (
          <MemberList others={others} onSelect={setViewing} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MemberList({ others, onSelect }: { others: Participant[]; onSelect: (p: Participant) => void }) {
  const { t } = useTranslation();
  // ດຶງລາຍຊື່ພະນັກງານທັງໝົດຄັ້ງດຽວ (ບໍ່ແມ່ນຄົນລະ request ຕໍ່ແຖວ) ແລ້ວຈັບຄູ່ດ້ວຍ userId — ຄືກັນກັບ
  // `ParticipantDetail` ແຕ່ນຳໃຊ້ກັບທຸກແຖວໃນລາຍການ ໃຫ້ເຫັນຕຳແໜ່ງ/ສາຂາ ໂດຍບໍ່ຕ້ອງກົດເຂົ້າໄປເບິ່ງເທື່ອລະຄົນ.
  const staff = useStaffList({ page: 1, pageSize: 100 });
  const byUserId = new Map(staff.data?.items.map((s) => [s.userId, s]) ?? []);

  return (
    <>
      <DialogHeader className="border-b border-border bg-muted/30 px-5 py-4">
        <DialogTitle>{t('messaging.membersTitle', { count: others.length })}</DialogTitle>
      </DialogHeader>
      <div className="max-h-96 space-y-0.5 overflow-y-auto p-2">
        {staff.isLoading
          ? others.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-2.5">
                <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/5" />
                  <Skeleton className="h-2.5 w-3/5" />
                </div>
              </div>
            ))
          : others.map((p) => {
              const match = byUserId.get(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelect(p)}
                  className="group flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-muted"
                >
                  <span className="relative shrink-0">
                    <PersonAvatar name={p.name} size={44} />
                    {match ? (
                      <span
                        className={cn(
                          'absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-card',
                          match.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                        )}
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                    {match ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {match.jobTitle} · {match.branchName}
                      </p>
                    ) : (
                      <span className="mt-0.5 inline-block rounded-full bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground">
                        {t(`messaging.role.${p.role}`, { defaultValue: p.role })}
                      </span>
                    )}
                  </div>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              );
            })}
      </div>
    </>
  );
}

function ParticipantDetail({ participant, onBack }: { participant: Participant; onBack?: () => void }) {
  const { t } = useTranslation();
  const staff = useStaffList({ q: participant.name, page: 1, pageSize: 10 });
  const match = staff.data?.items.find((s) => s.userId === participant.id);

  return (
    <>
      <DialogHeader className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="-ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t('common.back')}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          <DialogTitle>{t('messaging.participantInfo')}</DialogTitle>
        </div>
      </DialogHeader>

      {/* ຮູບ cover ອ່ອນໆຫຼັງ avatar — ໃຫ້ card ຮູ້ສຶກຄືໜ້າໂປຣຟາຍແທ້ໆ ບໍ່ແມ່ນແຄ່ list row ຂະຫຍາຍ. */}
      <div className="relative">
        <div
          className="h-14 w-full bg-gradient-to-br from-primary/20 via-primary/5 to-transparent"
          aria-hidden="true"
        />
        <div className="flex flex-col items-center gap-2 px-6 pb-5">
          <PersonAvatar
            name={participant.name}
            size={84}
            className="-mt-10 shrink-0 ring-4 ring-card"
          />
          <p className="text-center text-lg font-semibold leading-tight text-foreground">{participant.name}</p>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {t(`messaging.role.${participant.role}`, { defaultValue: participant.role })}
            </span>
            {match ? (
              <span
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                  match.isActive
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                <span
                  className={cn('h-1.5 w-1.5 rounded-full', match.isActive ? 'bg-emerald-500' : 'bg-muted-foreground')}
                  aria-hidden="true"
                />
                {match.isActive ? t('messaging.activeStaff') : t('messaging.inactiveStaff')}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {staff.isLoading ? (
        <div className="space-y-2 border-t border-border px-5 py-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : match ? (
        <div className="border-t border-border px-3 pb-4 pt-1">
          <SectionLabel>{t('messaging.workSection')}</SectionLabel>
          <div className="space-y-0.5">
            <InfoRow icon={Briefcase} caption={t('messaging.jobTitleLabel')} label={match.jobTitle} />
            <InfoRow icon={Building2} caption={t('messaging.branchLabel')} label={match.branchName} />
            <InfoRow
              icon={Calendar}
              caption={t('messaging.joinedLabel')}
              label={<DateTimeText value={match.hiredAt} mode="date" />}
            />
          </div>

          {match.phone || match.email ? (
            <>
              <SectionLabel>{t('messaging.contactSection')}</SectionLabel>
              <div className="space-y-0.5">
                {match.phone ? (
                  <InfoRow icon={Phone} caption={t('messaging.phoneLabel')} label={match.phone} href={`tel:${match.phone}`} />
                ) : null}
                {match.email ? (
                  <InfoRow icon={Mail} caption={t('messaging.emailLabel')} label={match.email} href={`mailto:${match.email}`} />
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <p className="border-t border-border px-5 py-4 text-center text-sm text-muted-foreground">
          {t('messaging.noProfileInfo')}
        </p>
      )}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-2 pb-1 pt-3 text-xs font-semibold text-muted-foreground">{children}</p>;
}

function InfoRow({
  icon: Icon,
  caption,
  label,
  href,
}: {
  icon: LucideIcon;
  caption: string;
  label: React.ReactNode;
  href?: string;
}) {
  const inner = (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{caption}</p>
        <p className="truncate font-medium text-foreground">{label}</p>
      </div>
    </div>
  );
  return href ? (
    <a href={href} className="block rounded-lg transition-colors hover:bg-muted">
      {inner}
    </a>
  ) : (
    inner
  );
}
