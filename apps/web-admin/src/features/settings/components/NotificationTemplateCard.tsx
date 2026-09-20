import { Bell, MessageSquare, Plus, RotateCcw, Sparkle } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface NotifTemplate {
  key: string;
  channel: 'sms' | 'push';
  enabled: boolean;
  body: string;
}

/** Sample values used to render the live preview — falls back to the raw {{var}} name. */
const SAMPLE_VALUES: Record<string, string> = {
  name: 'ສົມສະຫງວນ',
  service: 'ຕັດຜົມ',
  time: '14:00',
  date: '05/09/2026',
  code: 'BK-1024',
};

/** Every variable a given template is expected to support — lets us offer the ones not yet used. */
const KNOWN_VARS: Record<string, string[]> = {
  reminder_24h: ['name', 'service', 'time'],
  reminder_1h: ['service', 'time'],
  booking_confirmed: ['name', 'code', 'date'],
  waitlist_open: ['service'],
};

const VAR_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

function extractVariables(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(VAR_PATTERN)) {
    if (m[1]) found.add(m[1]);
  }
  return Array.from(found);
}

function renderPreview(body: string): string {
  return body.replace(VAR_PATTERN, (_, name: string) => SAMPLE_VALUES[name] ?? `{{${name}}}`);
}

/** GSM-7 covers only Latin script — Lao/Thai text always encodes as UCS-2 (70 / 67-per-segment). */
function isGsm7(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/.test(text);
}

function smsSegments(text: string): number {
  if (text.length === 0) return 0;
  const gsm7 = isGsm7(text);
  const single = gsm7 ? 160 : 70;
  const multi = gsm7 ? 153 : 67;
  if (text.length <= single) return 1;
  return Math.ceil(text.length / multi);
}

/**
 * Playfair Display (font-display, used for section titles) renders old-style serif
 * figures — the only titles on this page that embed digits ("24-hour reminder"),
 * so those numbers looked out of place next to the plain sans/tabular numerals
 * used everywhere else in the app. Break digit runs out into the sans body font.
 */
function TitleText({ text }: { text: string }) {
  const parts = text.split(/(\d+)/);
  return (
    <>
      {parts.map((part, i) =>
        /^\d+$/.test(part) ? (
          <span key={i} className="font-sans tabular-nums">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

interface NotificationTemplateCardProps {
  tpl: NotifTemplate;
  index: number;
  canManage: boolean;
  onToggle: (enabled: boolean) => void;
  onSave: (body: string) => void;
  saving: boolean;
}

export function NotificationTemplateCard({
  tpl,
  index,
  canManage,
  onToggle,
  onSave,
  saving,
}: NotificationTemplateCardProps) {
  const { t } = useTranslation();
  const [body, setBody] = useState(tpl.body);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dirty = body !== tpl.body;
  const usedVars = useMemo(() => extractVariables(body), [body]);
  const availableVars = (KNOWN_VARS[tpl.key] ?? []).filter((v) => !usedVars.includes(v));
  const preview = useMemo(() => renderPreview(body), [body]);
  const segments = tpl.channel === 'sms' ? smsSegments(body) : 0;

  const descKey = `notifTpl.desc.${tpl.key}`;
  const desc = t(descKey);
  const hasDesc = desc !== descKey;

  const Icon = tpl.channel === 'sms' ? MessageSquare : Bell;

  function insertVariable(name: string) {
    const ta = textareaRef.current;
    const pos = ta && document.activeElement === ta ? ta.selectionStart : body.length;
    const next = `${body.slice(0, pos)}{{${name}}}${body.slice(pos)}`;
    setBody(next);
    requestAnimationFrame(() => {
      const caret = pos + name.length + 4;
      ta?.focus();
      ta?.setSelectionRange(caret, caret);
    });
  }

  return (
    <section
      className={cn(
        'scroll-mt-44 overflow-hidden rounded-2xl border border-border bg-card shadow-sm',
        'transition-shadow duration-200 hover:shadow-md',
        'animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 motion-reduce:animate-none',
        !tpl.enabled && 'opacity-70',
      )}
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
    >
      <header className="relative flex items-start gap-2.5 px-4 py-3">
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            tpl.channel === 'sms' ? 'bg-info-soft text-info' : 'bg-primary-subtle text-primary',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 pt-px">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[15px] font-semibold leading-tight text-foreground">
              <TitleText text={t(`notifTpl.key.${tpl.key}`)} />
            </h2>
            <Badge variant={tpl.channel === 'sms' ? 'info' : 'primary'}>
              {tpl.channel.toUpperCase()}
            </Badge>
          </div>
          {hasDesc ? <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-px">
          <Switch
            checked={tpl.enabled}
            disabled={!canManage}
            aria-label={t('notifTpl.enabled')}
            onCheckedChange={onToggle}
          />
        </div>
        <span
          aria-hidden="true"
          className="absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-accent/70 via-accent/25 to-transparent"
        />
      </header>

      <div className="grid gap-4 px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-3">
          <div>
            <Textarea
              ref={textareaRef}
              value={body}
              disabled={!canManage}
              rows={3}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{t('notifTpl.charCount', { count: body.length })}</span>
              {tpl.channel === 'sms' && segments > 0 ? (
                <span className={cn(segments > 1 && 'font-medium text-warning')}>
                  {t('notifTpl.segments', { count: segments })}
                </span>
              ) : null}
            </div>
          </div>

          {usedVars.length > 0 || availableVars.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t('notifTpl.variablesLabel')}
              </span>
              {usedVars.map((v) => (
                <span
                  key={v}
                  className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground"
                >
                  {`{{${v}}}`}
                </span>
              ))}
              {canManage
                ? availableVars.map((v) => (
                    <button
                      key={v}
                      type="button"
                      title={t('notifTpl.insertVariable', { var: v })}
                      onClick={() => insertVariable(v)}
                      className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      <Plus className="h-2.5 w-2.5" aria-hidden="true" />
                      {`{{${v}}}`}
                    </button>
                  ))
                : null}
            </div>
          ) : null}
        </div>

        <div className="lg:pl-1">
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Sparkle className="h-3 w-3" aria-hidden="true" />
            {t('notifTpl.previewLabel')}
          </p>
          {tpl.channel === 'sms' ? (
            <div className="rounded-2xl bg-muted/40 p-3">
              <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-info-soft px-3 py-2 text-[13px] leading-relaxed text-foreground shadow-sm">
                {preview}
              </div>
              <p className="mt-1.5 pl-0.5 text-[10px] text-muted-foreground">
                {t('notifTpl.previewNow')}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-2.5 shadow-md">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[4px] bg-primary text-[8px] font-bold text-primary-foreground">
                  A
                </span>
                <span className="font-medium">{t('notifTpl.previewApp')}</span>
                <span aria-hidden="true">·</span>
                {t('notifTpl.previewNow')}
              </div>
              <p className="mt-1 text-[13px] font-semibold leading-tight text-foreground">
                {t(`notifTpl.key.${tpl.key}`)}
              </p>
              <p className="text-[13px] leading-snug text-muted-foreground">{preview}</p>
            </div>
          )}
        </div>
      </div>

      {canManage && dirty ? (
        <div className="flex justify-end gap-2 border-t border-border/70 bg-muted/20 px-4 py-2.5">
          <Button size="sm" variant="ghost" onClick={() => setBody(tpl.body)} disabled={saving}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t('common.discard')}
          </Button>
          <Button size="sm" variant="primary" onClick={() => onSave(body)} disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
