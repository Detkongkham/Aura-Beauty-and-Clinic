import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import type { HomeServiceTripView } from '@abcp/shared-types';

const LAOS_CENTER: [number, number] = [18.2, 103.9];

const STAFF_ICON = L.divIcon({
  className: 'dispatch-staff-icon',
  html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="8" fill="hsl(var(--primary))" stroke="hsl(var(--card))" stroke-width="2"/>
  </svg>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const DEST_ICON = L.divIcon({
  className: 'dispatch-dest-icon',
  html: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 22s7-6.16 7-12A7 7 0 0 0 5 10c0 5.84 7 12 7 12Z" fill="hsl(var(--accent))" stroke="hsl(var(--card))" stroke-width="1.5"/>
    <circle cx="12" cy="10" r="2.6" fill="hsl(var(--card))"/>
  </svg>`,
  iconSize: [26, 26],
  iconAnchor: [13, 24],
});

const LIVE_STATUSES: ReadonlyArray<HomeServiceTripView['status']> = ['ASSIGNED', 'EN_ROUTE'];

/**
 * Multi-marker live dispatch map — one stylist marker per ASSIGNED/EN_ROUTE trip (last known
 * position) plus a destination marker for each, built on the raw-Leaflet + OSM-tile pattern
 * from BranchMapPicker.tsx (deferred here since Phase 7B, see docs/phase7-progress.md).
 */
export function HomeServiceDispatchMap({
  trips,
  onSelectTrip,
}: {
  trips: HomeServiceTripView[];
  onSelectTrip: (trip: HomeServiceTripView) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const staffMarkers = useRef<Map<string, L.Marker>>(new Map());
  const destMarkers = useRef<Map<string, L.Marker>>(new Map());
  const onSelectRef = useRef(onSelectTrip);
  onSelectRef.current = onSelectTrip;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const map = L.map(containerRef.current, { center: LAOS_CENTER, zoom: 7 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);
    mapRef.current = map;
    const staffMarkerMap = staffMarkers.current;
    const destMarkerMap = destMarkers.current;

    const timer = window.setTimeout(() => map.invalidateSize(), 250);
    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      staffMarkerMap.clear();
      destMarkerMap.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const liveTrips = trips.filter((t) => LIVE_STATUSES.includes(t.status));
    const seenStaff = new Set<string>();
    const seenDest = new Set<string>();
    const allPoints: [number, number][] = [];

    for (const trip of liveTrips) {
      if (trip.lastLatitude != null && trip.lastLongitude != null) {
        seenStaff.add(trip.id);
        const pos: [number, number] = [trip.lastLatitude, trip.lastLongitude];
        allPoints.push(pos);
        const existing = staffMarkers.current.get(trip.id);
        if (existing) {
          existing.setLatLng(pos);
        } else {
          const marker = L.marker(pos, { icon: STAFF_ICON })
            .addTo(map)
            .bindTooltip(trip.matchedStaffName ?? '')
            .on('click', () => onSelectRef.current(trip));
          staffMarkers.current.set(trip.id, marker);
        }
      }
      if (trip.destLatitude != null && trip.destLongitude != null) {
        seenDest.add(trip.id);
        const pos: [number, number] = [trip.destLatitude, trip.destLongitude];
        allPoints.push(pos);
        const existing = destMarkers.current.get(trip.id);
        if (existing) {
          existing.setLatLng(pos);
        } else {
          const marker = L.marker(pos, { icon: DEST_ICON })
            .addTo(map)
            .bindTooltip(trip.customerName)
            .on('click', () => onSelectRef.current(trip));
          destMarkers.current.set(trip.id, marker);
        }
      }
    }

    for (const [id, marker] of staffMarkers.current) {
      if (!seenStaff.has(id)) {
        marker.remove();
        staffMarkers.current.delete(id);
      }
    }
    for (const [id, marker] of destMarkers.current) {
      if (!seenDest.has(id)) {
        marker.remove();
        destMarkers.current.delete(id);
      }
    }

    if (allPoints.length > 0) {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [32, 32], maxZoom: 15 });
    }
  }, [trips]);

  return <div ref={containerRef} className="h-[480px] w-full rounded-lg border border-border" />;
}
