import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Check,
  ChevronDown,
  Clock,
  Crown,
  Mail,
  MapPin,
  Menu,
  Navigation,
  Phone,
  QrCode,
  Smartphone,
  Star,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

import {
  BackToTop,
  CountUp,
  RotatingWord,
  Sparkles,
  Tilt,
  Wave,
  onSpotlight,
  useInView,
  useScrollProgress,
} from './site.fx';
import { Reveal, ReviewsCarousel, SectionHeading, Stars } from './site.parts';
import { MobileActionBar, PointsCalculator, TreatmentFinder } from './site.sections';
import { EXTRA_ICONS, PILLAR_ICONS, SERVICE_ICONS, initials } from './site.utils';
import {
  appCta,
  branches,
  branchesIntro,
  extras,
  faqIntro,
  faqs,
  footer,
  hero,
  journey,
  journeyIntro,
  membershipIntro,
  nav,
  pick,
  pillars,
  reviewsIntro,
  serviceCategories,
  servicesIntro,
  stats,
  team,
  teamIntro,
  tiers,
  trust,
  whyIntro,
  type Lang,
  type ServiceIcon,
} from './siteContent';

const SECTIONS = [
  'services',
  'finder',
  'why',
  'journey',
  'membership',
  'team',
  'reviews',
  'branches',
  'faq',
] as const;
type SectionId = (typeof SECTIONS)[number];

const CONTAINER = 'mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8';

function useLang(): Lang {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage === 'en' ? 'en' : 'lo';
}

/** Public, unauthenticated clinic website — the customer-facing portal. */
export function PublicSitePage() {
  const lang = useLang();

  useEffect(() => {
    const prev = document.title;
    document.title =
      lang === 'en' ? 'Aura Beauty & Clinic' : 'Aura Beauty & Clinic — ຄລີນິກຄວາມງາມ';
    return () => {
      document.title = prev;
    };
  }, [lang]);

  return (
    <div className="font-serif-all min-h-screen scroll-smooth bg-background text-foreground motion-reduce:scroll-auto">
      <a
        href="#main"
        className="sr-only z-[60] rounded-sm bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {pick(nav.skip, lang)}
      </a>
      <SiteHeader lang={lang} />
      <main id="main">
        <Hero lang={lang} />
        <TrustStrip lang={lang} />
        <Services lang={lang} />
        <TreatmentFinder lang={lang} container={CONTAINER} />
        <Why lang={lang} />
        <Journey lang={lang} />
        <Membership lang={lang} />
        <Team lang={lang} />
        <Reviews lang={lang} />
        <Branches lang={lang} />
        <Faq lang={lang} />
        <AppBand lang={lang} />
      </main>
      <SiteFooter lang={lang} />
      <PageChrome lang={lang} />
    </div>
  );
}

/** Floating, page-level extras: back-to-top ring + the phone action bar. */
function PageChrome({ lang }: { lang: Lang }) {
  const progress = useScrollProgress();
  return (
    <>
      <BackToTop label={pick(nav.top, lang)} progress={progress} />
      <MobileActionBar lang={lang} />
    </>
  );
}

/* ------------------------------------------------------------------ header */

function useActiveSection(): SectionId | null {
  const [active, setActive] = useState<SectionId | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit) setActive(hit.target.id as SectionId);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);
  return active;
}

function SiteHeader({ lang }: { lang: Lang }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const active = useActiveSection();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = SECTIONS.filter((s) => s !== 'why' && s !== 'journey' && s !== 'finder');
  const progress = useScrollProgress();

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-200',
        scrolled
          ? 'border-border bg-background/85 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/70'
          : 'border-transparent bg-transparent',
      )}
    >
      <div className={cn(CONTAINER, 'flex h-16 items-center gap-4')}>
        <a
          href="#top"
          className="flex shrink-0 items-center gap-2.5 rounded-sm"
          aria-label="Aura Beauty & Clinic"
        >
          <img
            src="/logo.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-full object-cover ring-1 ring-border"
          />
          <span className="leading-none">
            <span className="block font-display text-lg font-semibold text-primary">Aura</span>
            <span className="block text-2xs text-muted-foreground">Beauty &amp; Clinic</span>
          </span>
        </a>

        <nav aria-label={pick(nav.menu, lang)} className="mx-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {links.map((id) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  aria-current={active === id ? 'true' : undefined}
                  className={cn(
                    'relative rounded-full px-3 py-2 text-sm transition-colors duration-150',
                    active === id
                      ? 'font-semibold text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {pick(nav[id], lang)}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-x-3 -bottom-0.5 h-0.5 origin-left rounded-full bg-accent transition-transform duration-200',
                      active === id ? 'scale-x-100' : 'scale-x-0',
                    )}
                  />
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <LanguageToggle className="inline-flex" />
          <Link
            to={ROUTES.login}
            className="hidden rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
          >
            {pick(nav.staffLogin, lang)}
          </Link>
          <a
            href="#app"
            className="shine hidden h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors duration-150 hover:bg-primary-hover sm:inline-flex"
          >
            <CalendarCheck className="h-4 w-4" aria-hidden="true" />
            {pick(nav.book, lang)}
          </a>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={pick(nav.menu, lang)}
            aria-expanded={open}
            className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border bg-card lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        aria-hidden="true"
        style={{ transform: `scaleX(${progress})` }}
        className="absolute inset-x-0 -bottom-px h-0.5 origin-left bg-gradient-to-r from-primary via-primary-hover to-accent"
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="font-serif-all w-[86vw] max-w-sm">
          <SheetTitle className="font-display text-xl text-primary">Aura</SheetTitle>
          <nav aria-label={pick(nav.menu, lang)} className="mt-6">
            <ul className="space-y-1">
              {SECTIONS.map((id) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 items-center justify-between rounded-md px-3 text-base hover:bg-muted"
                  >
                    {pick(nav[id], lang)}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-6 space-y-2 border-t border-border pt-6">
            <a
              href="#app"
              onClick={() => setOpen(false)}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground"
            >
              <CalendarCheck className="h-4 w-4" aria-hidden="true" />
              {pick(nav.book, lang)}
            </a>
            <Link
              to={ROUTES.login}
              className="flex h-12 items-center justify-center rounded-full border border-border text-sm font-medium"
            >
              {pick(nav.staffLogin, lang)}
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

/* -------------------------------------------------------------------- hero */

function Hero({ lang }: { lang: Lang }) {
  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="relative -mt-16 overflow-hidden pt-16"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -right-40 -top-40 h-[36rem] w-[36rem] animate-float-slow rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -left-32 top-1/2 h-[26rem] w-[26rem] animate-float rounded-full bg-accent/20 blur-3xl [animation-delay:-3s]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.5)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.5)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      </div>

      <Sparkles />
      <div
        className={cn(
          CONTAINER,
          'relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-24',
        )}
      >
        <div className="space-y-7">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-medium text-foreground">
              <Crown className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick(hero.eyebrow, lang)}
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1
              id="hero-title"
              className="text-4xl font-semibold leading-[1.2] text-foreground [text-wrap:balance] sm:text-5xl lg:text-6xl"
            >
              {pick(hero.title, lang)}
            </h1>
            <p className="mt-3 text-2xl font-semibold leading-snug sm:text-3xl">
              <span className="text-muted-foreground">{pick(hero.madeFor, lang)} </span>
              <RotatingWord words={hero.words[lang]} className="text-gradient-gold" />
            </p>
          </Reveal>
          <Reveal delay={160}>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              {pick(hero.body, lang)}
            </p>
          </Reveal>
          <Reveal delay={240} className="flex flex-wrap items-center gap-3">
            <a
              href="#app"
              className="shine group inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground shadow-md shadow-primary/30 transition-[background-color,transform,box-shadow] duration-150 hover:bg-primary-hover hover:shadow-lg active:translate-y-px"
            >
              {pick(hero.ctaPrimary, lang)}
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                aria-hidden="true"
              />
            </a>
            <a
              href="#services"
              className="inline-flex h-12 items-center rounded-full border border-input bg-card/80 px-6 text-base font-semibold text-foreground backdrop-blur transition-colors duration-150 hover:border-primary/40 hover:text-primary"
            >
              {pick(hero.ctaSecondary, lang)}
            </a>
          </Reveal>
          <Reveal delay={320}>
            <dl className="grid max-w-xl grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-6 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.value}>
                  <dt className="sr-only">{pick(s.label, lang)}</dt>
                  <dd className="text-3xl font-semibold text-foreground">
                    <CountUp value={s.value} />
                  </dd>
                  <dd className="text-xs text-muted-foreground">{pick(s.label, lang)}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <HeroVisual lang={lang} />
      </div>
    </section>
  );
}

/** A glimpse of the customer app: the appointment pass + loyalty card the system actually issues. */
function HeroVisual({ lang }: { lang: Lang }) {
  return (
    <Reveal delay={200} className="relative mx-auto w-full max-w-md lg:max-w-none">
      <Tilt>
        <div
          aria-hidden="true"
          className="absolute inset-6 overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary to-primary-strong opacity-90"
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/40 blur-2xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.18)_1px,transparent_0)] bg-[size:18px_18px]" />
        </div>
        <div className="relative space-y-4 p-4 sm:p-8">
          {/* appointment pass */}
          <div className="rotate-[-2deg] rounded-lg border border-white/60 bg-card/95 p-5 shadow-lg backdrop-blur transition-transform duration-500 hover:rotate-0 motion-reduce:rotate-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">
                {pick(hero.passTitle, lang)}
              </p>
              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-2xs font-semibold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                {pick(hero.passStatus, lang)}
              </span>
            </div>
            <p className="mt-3 font-display text-xl font-semibold">
              {pick(hero.passService, lang)}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" aria-hidden="true" />
                {pick(hero.passWhen, lang)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                {pick(hero.passStaff, lang)}
              </span>
            </div>
            <div className="mt-4 flex items-center gap-3 border-t border-dashed border-border pt-4">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-foreground text-background">
                <QrCode className="h-7 w-7" aria-hidden="true" />
              </span>
              <p className="text-xs text-muted-foreground">{pick(hero.passQr, lang)}</p>
            </div>
          </div>

          {/* loyalty card */}
          <div className="ml-auto w-[85%] rotate-[3deg] rounded-lg bg-gradient-to-br from-accent-soft via-accent to-accent p-5 text-accent-foreground shadow-lg transition-transform duration-500 hover:rotate-0 motion-reduce:rotate-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold opacity-80">{pick(hero.pointsTitle, lang)}</p>
              <Crown className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">2,480</p>
            <p className="text-xs font-medium opacity-80">{pick(hero.pointsTier, lang)}</p>
          </div>

          {/* rating chip */}
          <div className="absolute -left-4 bottom-4 hidden animate-float items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-lg sm:flex">
            <Star className="h-4 w-4 fill-accent text-accent" aria-hidden="true" />
            <span className="text-sm font-semibold tabular-nums">4.9</span>
            <span className="text-xs text-muted-foreground">{pick(hero.rating, lang)}</span>
          </div>

          {/* queue chip */}
          <div className="absolute -top-3 right-10 hidden animate-float items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-lg [animation-delay:-2s] sm:flex">
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>
            <span className="text-xs font-semibold">{pick(hero.qrChip, lang)}</span>
          </div>
        </div>
      </Tilt>
    </Reveal>
  );
}

function TrustStrip({ lang }: { lang: Lang }) {
  const items = [...trust, ...trust];
  return (
    <div className="border-y border-border bg-card/60">
      <div className="group relative overflow-hidden py-4 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <ul className="flex w-max animate-[marquee_40s_linear_infinite] gap-10 pr-10 group-hover:[animation-play-state:paused] motion-reduce:animate-none motion-reduce:flex-wrap motion-reduce:justify-center">
          {items.map((it, i) => (
            <li
              key={i}
              aria-hidden={i >= trust.length ? true : undefined}
              className="flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground"
            >
              <BadgeCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              {pick(it, lang)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- services */

function Services({ lang }: { lang: Lang }) {
  const [cat, setCat] = useState<ServiceIcon>('facial');
  const current = serviceCategories.find((c) => c.id === cat);

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const n = serviceCategories.length;
    const next =
      e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : null;
    const target = next == null ? undefined : serviceCategories[next];
    if (!target) return;
    e.preventDefault();
    setCat(target.id);
    document.getElementById(`svc-tab-${target.id}`)?.focus();
  };

  if (!current) return null;

  return (
    <section id="services" aria-labelledby="services-title" className="scroll-mt-20 py-20 sm:py-28">
      <div className={CONTAINER}>
        <SectionHeading id="services-title" lang={lang} {...servicesIntro} />

        <Reveal className="mt-10">
          <div
            role="tablist"
            aria-label={pick(nav.services, lang)}
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0"
          >
            {serviceCategories.map((c, i) => {
              const Icon = SERVICE_ICONS[c.id];
              const on = c.id === cat;
              return (
                <button
                  key={c.id}
                  id={`svc-tab-${c.id}`}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-controls="svc-panel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => setCat(c.id)}
                  onKeyDown={(e) => onTabKey(e, i)}
                  className={cn(
                    'inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition-[background-color,border-color,color] duration-150',
                    on
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {pick(c.name, lang)}
                </button>
              );
            })}
          </div>
        </Reveal>

        <div id="svc-panel" role="tabpanel" aria-labelledby={`svc-tab-${cat}`} className="mt-8">
          <p className="mb-6 text-center text-sm text-muted-foreground">
            {pick(current.blurb, lang)}
          </p>
          <ul key={cat} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {current.items.map((s, i) => {
              const Icon = SERVICE_ICONS[current.id];
              return (
                <li
                  key={s.name.en}
                  style={{ animationDelay: `${i * 70}ms` }}
                  onMouseMove={onSpotlight}
                  className="spotlight group relative flex flex-col rounded-lg border border-border bg-card p-6 shadow-sm transition-[transform,box-shadow,border-color] duration-200 animate-in fade-in slide-in-from-bottom-3 fill-mode-both hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg motion-reduce:animate-none motion-reduce:hover:translate-y-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-primary-subtle text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    {s.popular && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-2xs font-semibold text-accent-foreground dark:text-accent">
                        <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                        {pick(servicesIntro.popular, lang)}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-5 text-xl">{pick(s.name, lang)}</h3>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    {s.minutes} {pick(servicesIntro.minutes, lang)}
                  </p>
                  <ul className="mb-6 mt-4 space-y-2">
                    {s.points.map((p) => (
                      <li key={p.en} className="flex items-start gap-2 text-sm">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-success"
                          aria-hidden="true"
                        />
                        {pick(p, lang)}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-4">
                    <div>
                      <p className="text-2xs text-muted-foreground">
                        {pick(servicesIntro.from, lang)}
                      </p>
                      <p className="text-lg font-semibold tabular-nums text-foreground">
                        {s.from === 0 ? pick(servicesIntro.free, lang) : formatCurrency(s.from)}
                      </p>
                    </div>
                    <a
                      href="#app"
                      className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary-subtle"
                    >
                      {pick(servicesIntro.book, lang)}
                      <ArrowRight
                        className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            {pick(servicesIntro.sample, lang)}
          </p>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- why */

function Why({ lang }: { lang: Lang }) {
  return (
    <section id="why" aria-labelledby="why-title" className="scroll-mt-20 bg-card py-20 sm:py-28">
      <div className={cn(CONTAINER, 'grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center')}>
        <div className="space-y-8">
          <SectionHeading id="why-title" lang={lang} align="left" {...whyIntro} />
          <Reveal
            delay={120}
            className="relative overflow-hidden rounded-lg bg-gradient-to-br from-primary-strong to-primary p-8 text-primary-foreground shadow-lg"
          >
            <div
              aria-hidden="true"
              className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/30 blur-2xl"
            />
            <p className="relative text-5xl font-semibold">
              <CountUp value="4.9" />
            </p>
            <Stars className="relative mt-2" />
            <p className="relative mt-3 max-w-xs text-sm opacity-90">
              {pick(reviewsIntro.based, lang)}
            </p>
          </Reveal>
        </div>
        <ul className="grid gap-5 sm:grid-cols-2">
          {pillars.map((p, i) => {
            const Icon = PILLAR_ICONS[p.icon];
            return (
              <Reveal as="li" key={p.title.en} delay={i * 90}>
                <div
                  onMouseMove={onSpotlight}
                  className="spotlight group h-full rounded-lg border border-border bg-background p-6 transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md motion-reduce:hover:translate-y-0"
                >
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 transition-transform duration-300 group-hover:rotate-[8deg] group-hover:scale-110 motion-reduce:group-hover:transform-none text-accent-foreground ring-1 ring-accent/30 dark:text-accent">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg">{pick(p.title, lang)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {pick(p.body, lang)}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- journey */

function Journey({ lang }: { lang: Lang }) {
  const [lineRef, drawn] = useInView<HTMLOListElement>({ threshold: 0.4 });
  return (
    <section id="journey" aria-labelledby="journey-title" className="scroll-mt-20 py-20 sm:py-28">
      <div className={CONTAINER}>
        <SectionHeading id="journey-title" lang={lang} {...journeyIntro} />
        <ol ref={lineRef} className="relative mt-14 grid gap-8 md:grid-cols-4 md:gap-6">
          <div
            aria-hidden="true"
            className="absolute left-6 top-6 hidden h-0.5 w-[calc(100%-3rem)] rounded-full bg-border md:block"
          />
          <div
            aria-hidden="true"
            style={{ transform: `scaleX(${drawn ? 1 : 0})` }}
            className="absolute left-6 top-6 hidden h-0.5 w-[calc(100%-3rem)] origin-left rounded-full bg-gradient-to-r from-primary via-accent to-primary transition-transform duration-[1600ms] ease-out motion-reduce:transition-none md:block"
          />
          {/* vertical rail on phones */}
          <div
            aria-hidden="true"
            className="absolute bottom-6 left-6 top-6 w-0.5 -translate-x-1/2 rounded-full bg-gradient-to-b from-primary via-accent to-primary/20 md:hidden"
          />
          {journey.map((step, i) => (
            <Reveal
              as="li"
              key={step.title.en}
              delay={i * 110}
              className="relative flex gap-4 md:block"
            >
              <span className="group/step relative z-10 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-4 border-background bg-primary text-lg font-semibold text-primary-foreground shadow-md transition-transform duration-300 hover:scale-110 motion-reduce:hover:scale-100">
                <span
                  aria-hidden="true"
                  className="absolute inset-0 animate-ping rounded-full bg-primary/30 [animation-duration:2.4s] motion-reduce:hidden"
                  style={{ animationDelay: `${i * 0.6}s` }}
                />
                <span className="relative">{i + 1}</span>
              </span>
              <div className="md:mt-5">
                <h3 className="text-lg">{pick(step.title, lang)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {pick(step.body, lang)}
                </p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- membership */

function Membership({ lang }: { lang: Lang }) {
  return (
    <>
      <Wave className="-mb-px text-primary-strong" />
      <section
        id="membership"
        aria-labelledby="membership-title"
        className="relative scroll-mt-20 overflow-hidden bg-primary-strong py-20 text-white sm:py-28"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-80 w-[48rem] -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />
        </div>
        <div className={cn(CONTAINER, 'relative')}>
          <SectionHeading id="membership-title" lang={lang} invert {...membershipIntro} />

          <ul className="mt-14 grid items-stretch gap-6 lg:grid-cols-3">
            {tiers.map((tier, i) => (
              <Reveal as="li" key={tier.name} delay={i * 100}>
                <div
                  onMouseMove={onSpotlight}
                  className={cn(
                    'spotlight relative flex h-full flex-col rounded-lg p-7 transition-transform duration-200 hover:-translate-y-1 motion-reduce:hover:translate-y-0',
                    tier.featured
                      ? 'bg-card text-card-foreground shadow-lg ring-2 ring-accent'
                      : 'border border-white/15 bg-white/5 backdrop-blur',
                  )}
                >
                  {tier.featured && (
                    <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-2xs font-semibold text-accent-foreground shadow-sm">
                      <Crown className="h-3 w-3" aria-hidden="true" />
                      {pick(servicesIntro.popular, lang)}
                    </span>
                  )}
                  <h3 className={cn('text-2xl', !tier.featured && 'text-white')}>{tier.name}</h3>
                  <p
                    className={cn(
                      'mt-1 text-sm',
                      tier.featured ? 'text-muted-foreground' : 'text-white/70',
                    )}
                  >
                    {pick(tier.spend, lang)}
                  </p>
                  <p
                    className={cn(
                      'mt-6 text-xs font-semibold',
                      tier.featured ? 'text-primary' : 'text-accent-soft',
                    )}
                  >
                    {pick(membershipIntro.perksTitle, lang)}
                  </p>
                  <ul className="mt-3 space-y-2.5">
                    {tier.perks.map((p) => (
                      <li key={p.en} className="flex items-start gap-2.5 text-sm">
                        <Check
                          className={cn(
                            'mt-0.5 h-4 w-4 shrink-0',
                            tier.featured ? 'text-success' : 'text-accent-soft',
                          )}
                          aria-hidden="true"
                        />
                        {pick(p, lang)}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </ul>

          <Reveal className="mt-10">
            <PointsCalculator lang={lang} />
          </Reveal>

          <Reveal className="mt-14">
            <p className="mb-5 text-center text-sm font-semibold text-accent-soft">
              {pick(membershipIntro.extrasTitle, lang)}
            </p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {extras.map((x) => {
                const Icon = EXTRA_ICONS[x.icon];
                return (
                  <li
                    key={x.title.en}
                    className="flex items-start gap-3 rounded-lg border border-white/15 bg-white/5 p-4"
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/20 text-accent-soft">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{pick(x.title, lang)}</span>
                      <span className="block text-xs text-white/75">{pick(x.body, lang)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>
      </section>
      <Wave flip className="-mt-px text-primary-strong" />
    </>
  );
}

/* -------------------------------------------------------------------- team */

const TEAM_TINTS = [
  'from-primary to-primary-strong',
  'from-chart-3 to-primary-strong',
  'from-chart-4 to-primary',
  'from-accent to-chart-6',
];

function Team({ lang }: { lang: Lang }) {
  return (
    <section id="team" aria-labelledby="team-title" className="scroll-mt-20 py-20 sm:py-28">
      <div className={CONTAINER}>
        <SectionHeading id="team-title" lang={lang} {...teamIntro} />
        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {team.map((m, i) => (
            <Reveal as="li" key={m.name.en} delay={i * 90}>
              <article className="group h-full overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-[box-shadow,transform] duration-200 hover:-translate-y-1 hover:shadow-lg motion-reduce:hover:translate-y-0">
                <div
                  className={cn(
                    'relative flex aspect-[4/3] items-center justify-center bg-gradient-to-br',
                    TEAM_TINTS[i % TEAM_TINTS.length],
                  )}
                >
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_55%)]"
                  />
                  <span className="relative inline-flex h-20 w-20 items-center justify-center rounded-full bg-white/20 font-display text-2xl font-semibold text-white ring-4 ring-white/30 backdrop-blur transition-transform duration-300 group-hover:scale-105 motion-reduce:group-hover:scale-100">
                    {initials(m.name.en)}
                  </span>
                  <span className="absolute bottom-3 right-3 rounded-full bg-black/25 px-2.5 py-1 text-2xs font-semibold text-white backdrop-blur">
                    {m.years} {pick(teamIntro.years, lang)}
                  </span>
                  <a
                    href="#app"
                    className="absolute inset-x-3 bottom-3 inline-flex h-10 translate-y-3 items-center justify-center gap-1.5 rounded-full bg-white text-sm font-semibold text-primary opacity-0 shadow-md transition-[opacity,transform] duration-300 focus-visible:translate-y-0 focus-visible:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none"
                  >
                    <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                    {pick(teamIntro.bookWith, lang)}{' '}
                    {pick(m.name, lang).split(' ').slice(0, 2).join(' ')}
                  </a>
                </div>
                <div className="p-5">
                  <h3 className="text-lg leading-snug">{pick(m.name, lang)}</h3>
                  <p className="mt-1 text-sm text-primary">{pick(m.role, lang)}</p>
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    {pick(m.focus, lang)}
                  </p>
                  <div className="mt-4">
                    <div className="flex justify-between text-2xs text-muted-foreground">
                      <span>{pick(teamIntro.experience, lang)}</span>
                      <span className="tabular-nums">
                        {m.years} {pick(teamIntro.years, lang)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full origin-left rounded-full bg-gradient-to-r from-primary to-accent"
                        style={{ width: `${Math.min(100, (m.years / 15) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- reviews */

function Reviews({ lang }: { lang: Lang }) {
  return (
    <section
      id="reviews"
      aria-labelledby="reviews-title"
      className="scroll-mt-20 bg-card py-20 sm:py-28"
    >
      <div className={cn(CONTAINER, 'grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center')}>
        <div className="space-y-6">
          <SectionHeading id="reviews-title" lang={lang} align="left" {...reviewsIntro} />
          <Reveal delay={100} className="flex items-center gap-4">
            <p className="font-display text-5xl font-semibold tabular-nums">4.9</p>
            <div>
              <Stars />
              <p className="mt-1 text-xs text-muted-foreground">{pick(reviewsIntro.based, lang)}</p>
            </div>
          </Reveal>
        </div>
        <Reveal delay={150}>
          <ReviewsCarousel lang={lang} />
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- branches */

function vientianeHour() {
  const d = new Date();
  return ((d.getUTCHours() + 7) % 24) + d.getUTCMinutes() / 60;
}

function Branches({ lang }: { lang: Lang }) {
  const [hour, setHour] = useState(vientianeHour);
  useEffect(() => {
    const id = window.setInterval(() => setHour(vientianeHour()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const hh = Math.floor(hour);
  const mm = Math.floor((hour - hh) * 60);
  const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const left = (h: number) => {
    const mins = Math.max(0, Math.round(h * 60));
    return `${Math.floor(mins / 60)}${pick(branchesIntro.hrs, lang)} ${mins % 60}${pick(branchesIntro.min, lang)}`;
  };

  return (
    <section id="branches" aria-labelledby="branches-title" className="scroll-mt-20 py-20 sm:py-28">
      <div className={CONTAINER}>
        <SectionHeading id="branches-title" lang={lang} {...branchesIntro} />
        <Reveal className="mt-6 flex justify-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-xs">
            <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-muted-foreground">{pick(branchesIntro.now, lang)}</span>
            <span className="font-semibold tabular-nums">{clock}</span>
          </p>
        </Reveal>
        <ul className="mt-14 grid gap-6 md:grid-cols-3">
          {branches.map((b, i) => {
            // Opening days vary per branch; this badge only reflects today's hours window.
            const open = hour >= b.open && hour < b.close;
            return (
              <Reveal as="li" key={b.name.en} delay={i * 90}>
                <article
                  onMouseMove={onSpotlight}
                  className="spotlight group flex h-full flex-col rounded-lg border border-border bg-card p-6 shadow-sm transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-primary-subtle text-primary transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:animate-bounce motion-reduce:group-hover:animate-none">
                      <MapPin className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold',
                        open ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          open ? 'bg-success' : 'bg-muted-foreground',
                        )}
                        aria-hidden="true"
                      />
                      {pick(open ? branchesIntro.openNow : branchesIntro.closed, lang)}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg leading-snug">{pick(b.name, lang)}</h3>
                  <p
                    className={cn(
                      'mt-1 text-xs font-medium',
                      open ? 'text-success' : 'text-muted-foreground',
                    )}
                  >
                    {open
                      ? `${pick(branchesIntro.closesIn, lang)} ${left(b.close - hour)}`
                      : `${pick(branchesIntro.opensAt, lang)} ${String(b.open).padStart(2, '0')}:00`}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{pick(b.address, lang)}</p>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <dt className="sr-only">{pick(branchesIntro.hours, lang)}</dt>
                      <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <dd className="tabular-nums">{pick(b.hours, lang)}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt className="sr-only">{pick(branchesIntro.call, lang)}</dt>
                      <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <dd className="tabular-nums">{b.phone}</dd>
                    </div>
                  </dl>
                  <div className="mt-auto flex gap-2 pt-6">
                    <a
                      href={b.map}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                    >
                      <Navigation className="h-4 w-4" aria-hidden="true" />
                      {pick(branchesIntro.directions, lang)}
                    </a>
                    <a
                      href={`tel:${b.phone.replace(/\s+/g, '')}`}
                      className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-input text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <Phone className="h-4 w-4" aria-hidden="true" />
                      {pick(branchesIntro.call, lang)}
                    </a>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- faq */

function Faq({ lang }: { lang: Lang }) {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 bg-card py-20 sm:py-28">
      <div className={cn(CONTAINER, 'max-w-3xl')}>
        <SectionHeading id="faq-title" lang={lang} {...faqIntro} />
        <div className="mt-12 space-y-3">
          {faqs.map((f, i) => (
            <Reveal key={f.q.en} delay={i * 60}>
              <details
                className="group rounded-lg border border-border bg-background transition-[border-color,box-shadow] duration-200 open:border-primary/30 open:shadow-sm"
                open={i === 0}
              >
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-5 py-4 text-left text-base font-semibold [&::-webkit-details-marker]:hidden">
                  {pick(f.q, lang)}
                  <ChevronDown
                    className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 group-open:text-primary"
                    aria-hidden="true"
                  />
                </summary>
                <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                  {pick(f.a, lang)}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- app cta */

function AppBand({ lang }: { lang: Lang }) {
  return (
    <section id="app" aria-labelledby="app-title" className="scroll-mt-20 py-20 sm:py-28">
      <div className={CONTAINER}>
        <Reveal className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-primary via-primary-strong to-[hsl(var(--primary-strong))] px-6 py-14 text-primary-foreground shadow-lg sm:px-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-accent/30 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 left-10 h-64 w-64 rounded-full bg-white/10 blur-3xl"
          />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="space-y-5">
              <h2 id="app-title" className="text-3xl leading-tight text-white sm:text-4xl">
                {pick(appCta.title, lang)}
              </h2>
              <p className="max-w-xl text-base leading-relaxed text-white/85">
                {pick(appCta.body, lang)}
              </p>
              <div className="flex flex-wrap gap-3">
                {[appCta.ios, appCta.android].map((label) => (
                  <span
                    key={label.en}
                    aria-disabled="true"
                    className="inline-flex h-12 items-center gap-2.5 rounded-full bg-white/95 px-5 text-sm font-semibold text-foreground shadow-md"
                  >
                    <Smartphone className="h-5 w-5 text-primary" aria-hidden="true" />
                    {pick(label, lang)}
                    <span className="rounded-full bg-accent/20 px-2 py-0.5 text-2xs font-semibold text-accent-foreground">
                      {pick(appCta.soon, lang)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <div className="hidden justify-center lg:flex" aria-hidden="true">
              <div className="relative h-72 w-40 rotate-6 rounded-[2rem] border-[6px] border-white/80 bg-gradient-to-b from-white to-primary-subtle p-3 shadow-lg">
                <div className="mx-auto h-1.5 w-12 rounded-full bg-foreground/20" />
                <div className="mt-4 space-y-2">
                  <div className="h-16 rounded-lg bg-gradient-to-br from-primary to-primary-strong" />
                  <div className="h-8 rounded-md bg-accent/40" />
                  <div className="h-8 rounded-md bg-muted" />
                  <div className="h-8 rounded-md bg-muted" />
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ footer */

function SiteFooter({ lang }: { lang: Lang }) {
  return (
    <footer className="border-t border-border bg-card pb-20 sm:pb-0">
      <div
        className={cn(CONTAINER, 'grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]')}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
            />
            <span className="font-display text-xl font-semibold text-primary">
              Aura Beauty &amp; Clinic
            </span>
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">{pick(footer.tagline, lang)}</p>
        </div>
        <nav aria-labelledby="footer-explore">
          <p id="footer-explore" className="text-sm font-semibold">
            {pick(footer.explore, lang)}
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {SECTIONS.map((id) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  {pick(nav[id], lang)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="text-sm font-semibold">{pick(footer.contact, lang)}</p>
          <ul className="mt-4 space-y-3 text-sm">
            <li>
              <a
                href={`tel:${footer.phone.replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                <span className="tabular-nums">{footer.phone}</span>
              </a>
            </li>
            <li>
              <a
                href={`mailto:${footer.email}`}
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                {footer.email}
              </a>
            </li>
            <li>
              <Link
                to={ROUTES.login}
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary"
              >
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                {pick(nav.staffLogin, lang)}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <p className={cn(CONTAINER, 'py-5 text-xs text-muted-foreground')}>
          © {new Date().getFullYear()} Aura Beauty &amp; Clinic · {pick(footer.rights, lang)}
        </p>
      </div>
    </footer>
  );
}
