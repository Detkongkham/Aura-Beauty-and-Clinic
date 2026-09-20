import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { Crosshair, LocateFixed, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import type { LaoProvinceId } from '@/types/models';

import { PROVINCE_CENTER } from './lao-provinces';

interface BranchMapPickerProps {
  provinceId: LaoProvinceId;
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  onClear: () => void;
  className?: string;
}

const LAOS_CENTER: [number, number] = [18.2, 103.9];
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const isValid = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);

/** Gold teardrop pin as a Leaflet divIcon (avoids the bundler broken-image issue). */
const PIN_ICON = L.divIcon({
  className: 'branch-pin-icon',
  html: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 22s7-6.16 7-12A7 7 0 0 0 5 10c0 5.84 7 12 7 12Z" fill="hsl(var(--accent))" stroke="hsl(var(--card))" stroke-width="1.5"/>
    <circle cx="12" cy="10" r="2.6" fill="hsl(var(--card))"/>
  </svg>`,
  iconSize: [30, 30],
  iconAnchor: [15, 28],
});

/**
 * Real slippy-map coordinate picker (Leaflet + OpenStreetMap tiles). Click or
 * drag the pin to set lat/lng; "use my location" reads the browser GPS. Falls
 * back gracefully to a blank map (click still works) when tiles can't load.
 */
export function BranchMapPicker({
  provinceId,
  lat,
  lng,
  onChange,
  onClear,
  className,
}: BranchMapPickerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [locating, setLocating] = useState(false);

  // Init the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const start: [number, number] = isValid(lat, lng)
      ? [lat, lng]
      : (PROVINCE_CENTER[provinceId] ?? LAOS_CENTER);

    const map = L.map(containerRef.current, { center: start, zoom: isValid(lat, lng) ? 14 : 9 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      onChangeRef.current(round5(e.latlng.lat), round5(e.latlng.lng));
    });
    mapRef.current = map;

    // Radix dialog animates in — remeasure once it has settled.
    const timer = window.setTimeout(() => map.invalidateSize(), 300);
    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync the marker with the current lat/lng (from map clicks, the number
  // inputs, or "use my location").
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!isValid(lat, lng)) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }
    const pos: [number, number] = [lat, lng];
    if (!markerRef.current) {
      const marker = L.marker(pos, { icon: PIN_ICON, draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        onChangeRef.current(round5(p.lat), round5(p.lng));
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng(pos);
    }
    if (!map.getBounds().contains(pos)) map.panTo(pos);
  }, [lat, lng]);

  // Recenter on the chosen province while there is no pin yet.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || isValid(lat, lng)) return;
    map.setView(PROVINCE_CENTER[provinceId] ?? LAOS_CENTER, 9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provinceId]);

  const locate = () => {
    if (!navigator.geolocation) {
      toast.error(t('branches.form.locationUnsupported'));
      return;
    }
    // Geolocation is only served on a secure context (https or localhost). On a
    // LAN IP / hostname over http the call fails instantly with code 1 and no
    // prompt — tell the user that's why instead of a generic "denied".
    if (!window.isSecureContext) {
      toast.error(t('branches.form.locationInsecure'));
      return;
    }

    setLocating(true);

    const onOk = (pos: GeolocationPosition) => {
      setLocating(false);
      onChange(round5(pos.coords.latitude), round5(pos.coords.longitude));
      mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 16);
    };

    const onFail = (err: GeolocationPositionError, isRetry: boolean) => {
      // A high-accuracy timeout often clears on a coarse retry (no GPS radio).
      if (err.code === err.TIMEOUT && !isRetry) {
        navigator.geolocation.getCurrentPosition(
          onOk,
          (e) => onFail(e, true),
          { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 },
        );
        return;
      }
      setLocating(false);
      if (err.code === err.PERMISSION_DENIED) toast.error(t('branches.form.locationBlocked'));
      else if (err.code === err.POSITION_UNAVAILABLE)
        toast.error(t('branches.form.locationUnavailable'));
      else if (err.code === err.TIMEOUT) toast.error(t('branches.form.locationTimeout'));
      else toast.error(t('branches.form.locationDenied'));
    };

    navigator.geolocation.getCurrentPosition(onOk, (e) => onFail(e, false), {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000,
    });
  };

  const hasPin = isValid(lat, lng);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60 motion-reduce:transition-none"
        >
          <LocateFixed
            className={cn('h-3.5 w-3.5', locating && 'animate-pulse motion-reduce:animate-none')}
            aria-hidden="true"
          />
          {locating ? t('branches.form.locating') : t('branches.form.useMyLocation')}
        </button>
        {hasPin ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            {t('branches.form.clearPin')}
          </button>
        ) : null}
      </div>

      <div
        ref={containerRef}
        className={cn('w-full', className)}
        style={{ minHeight: 260 }}
        role="application"
        aria-label={t('branches.form.pickOnMap')}
      />

      <p className="flex items-center gap-1 border-t border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
        <Crosshair className="h-3 w-3 shrink-0" aria-hidden="true" />
        {hasPin
          ? t('branches.form.pinAt', { lat: lat.toFixed(5), lng: lng.toFixed(5) })
          : t('branches.form.mapHint')}
      </p>
    </div>
  );
}
