# Typography — front 12px ຄົງທີ່ (ຫຼາຍໜ້າ)

## ມາດຕະຖານ: **12px ທຸກຕົວ**

ຂໍ້ຄວາມທັງໝົດໃນໜ້າ/component ທີ່ລະບຸລຸ່ມ ໃຊ້ຂະໜາດ **fontSize 12 / lineHeight 17** — ຄົງທີ່, ບໍ່ມີລຳດັບຊັ້ນຂະໜາດ (no type scale). ຫົວຂໍ້, tab, chip, ຊື່ບໍລິການ, ຊື່ຊ່າງ, ລາຄາ, ໝາຍເຫດ, ປຸ່ມ — 12px ໝົດ. ຄວາມແຕກຕ່າງໃຫ້ໃຊ້ **weight + ສີ** ເທົ່ານັ້ນ (`font-lao` / `-medium` / `-semibold` / `-bold`, token ສີ).

ຂອບເຂດ: **ໄຟລ໌ລຸ່ມນີ້** (ແຕ່ລະໄຟລ໌ມີ `function T` ຂອງໂຕເອງ) —
- `src/screens/appointments/AppointmentsScreen.tsx`
- `src/features/appointments/AppointmentCard.tsx`
- `src/screens/profile/ProfileScreen.tsx`
- `src/screens/home/HomeScreen.tsx`
- `src/features/catalog/PopularServiceCard.tsx` (ໃຊ້ສະເພາະ Home)
- `src/screens/catalog/ServiceListScreen.tsx`
- `src/screens/catalog/ServiceDetailScreen.tsx`
- `src/features/catalog/ServiceResultCard.tsx`
- `src/features/catalog/search.parts.tsx`
- `src/features/catalog/service-detail.parts.tsx`
- `src/features/catalog/SearchLanding.tsx`
- `src/features/catalog/SearchFilterSheet.tsx`
- `src/features/catalog/CategoryTile.tsx` (ບັດໝວດຮ່ວມ — Home §ໝວດໝູ່ + SearchLanding)

ໜ້າອື່ນ (Booking wizard, auth ...) **ບໍ່ກ່ຽວ** — ຍັງໃຊ້ type ramp ຂອງ `components/ui/Text.tsx` ຕາມເກົ່າ.

ໝາຍເຫດ catalog: `PriceText` (variant label = 15px) ບໍ່ຜ່ານ `T` — ໃນໄຟລ໌ຂອບເຂດ ໃຫ້ໃຊ້ `<T className="font-lao-bold text-primary-strong">{formatLAK(x)}</T>` ແທນ.

## ວິທີບັງຄັບ (ເປັນຫຍັງບໍ່ໃຊ້ class `text-[Npx]`)

ໃນ NativeWind 4.1 class ຊື່ມາດຕະຖານ `text-base` (ມາຈາກ `<Text variant="body">` — default ຂອງ component ຮ່ວມ) **ຊະນະ** class arbitrary `text-[Npx]` ບໍ່ວ່າຈະຂຽນທ້າຍ. ສະນັ້ນ `className="text-[Npx]"` ບໍ່ມີຜົນເທິງ `<Text>`.

ວິທີແກ້ = wrapper ພາຍໃນແຕ່ລະໄຟລ໌ ຊື່ `T` ທີ່ບັງຄັບຂະໜາດຜ່ານ **inline `style`** (style ຊະນະ class ສະເໝີ):

```tsx
function T({ style, ...rest }: React.ComponentProps<typeof Text>) {
  return <Text {...rest} style={[{ fontSize: 12, lineHeight: 17 }, style]} />;
}
```

ທຸກ `<Text>` ໃນ render ຂອງໄຟລ໌ເຫຼົ່ານີ້ = `<T>`. `className` ເທິງ `<T>` ໃຊ້ຄຸມແຕ່ **weight / ສີ** — ຢ່າໃສ່ `text-[Npx]` (ບໍ່ມີຜົນ / ຂີ້ຕົວະ).

`TextInput` ຂອງຊ່ອງຄົ້ນຫາ ໃຊ້ `className="... text-[12px] ..."` ໂດຍກົງໄດ້ (RN TextInput ບໍ່ມີ variant ຊົນ).

## ຖ້າຢາກປ່ຽນຂະໜາດ

ແກ້ຄ່າດຽວ: `fontSize` ໃນ `function T` ຂອງແຕ່ລະໄຟລ໌ (5 ບ່ອນ). ບໍ່ຕ້ອງໄລ່ແກ້ class ເທື່ອລະຈຸດ.

## ໄອຄອນ

ຂະໜາດ `Ionicons` (`size={...}`) ບໍ່ແມ່ນ "front" — ບໍ່ຜູກກັບ 12px, ຕັ້ງຕາມ layout.
