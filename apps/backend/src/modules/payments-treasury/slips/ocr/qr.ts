import jsQR from 'jsqr';
import sharp from 'sharp';

/** ຖອດ QR ໃນສະລິບ (ຊັ້ນ 1 ຂອງ pipeline) — ອ່ານຂໍ້ມູນດິບ ບໍ່ແມ່ນເດົາຈາກຮູບ. ຄືນ null ຖ້າບໍ່ພົບ QR. */
export async function decodeQr(image: Buffer): Promise<string | null> {
  // ລອງ 2 ຂະໜາດ — QR ນ້ອຍໃນຮູບໃຫຍ່ບາງເທື່ອອ່ານໄດ້ດີກວ່າຫຼັງຫຍໍ້.
  for (const width of [1200, 700]) {
    const { data, info } = await sharp(image, { limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const code = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height, {
      inversionAttempts: 'attemptBoth',
    });
    if (code?.data) return code.data;
  }
  return null;
}

export interface QrFields {
  reference?: string;
  amount?: number;
}

/** ຖອດ TLV ຂອງ EMV QR (tag 00 "01" ນຳໜ້າ) ເປັນ map — ຄືນ null ຖ້າ format ບໍ່ຖືກ. */
function parseTlv(payload: string): Map<string, string> | null {
  const out = new Map<string, string>();
  let i = 0;
  while (i < payload.length) {
    if (i + 4 > payload.length) return null;
    const tag = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!Number.isInteger(len) || i + 4 + len > payload.length) return null;
    out.set(tag, payload.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return out;
}

/**
 * ດຶງ reference / ຈຳນວນເງິນຈາກ QR payload ຢ່າງ best-effort. ຮອງຮັບ 2 ແບບທົ່ວໄປ:
 * (ກ) EMV/Lao-QR TLV — tag 54 = amount, tag 62 › 05 = reference label;
 * (ຂ) URL ກວດສອບຂອງທະນາຄານ — ດຶງຄ່າຈາກ query `ref|txn|id|tid` ຫຼື ສ່ວນສຸດທ້າຍຂອງ path.
 * ຮູບແບບແທ້ຂອງແຕ່ລະທະນາຄານຍັງຕ້ອງປັບເມື່ອມີສະລິບຕົວຢ່າງຈິງ.
 */
export function parseQrPayload(payload: string): QrFields {
  const text = payload.trim();
  const tlv = text.startsWith('000201') ? parseTlv(text) : null;
  if (tlv) {
    const fields: QrFields = {};
    const amount = Number(tlv.get('54'));
    if (Number.isFinite(amount) && amount > 0) fields.amount = amount;
    const extra = tlv.get('62');
    const inner = extra ? parseTlv(extra) : null;
    const ref = inner?.get('05') ?? inner?.get('01');
    if (ref && ref !== '***') fields.reference = ref;
    return fields;
  }
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      for (const key of ['ref', 'reference', 'txn', 'txnRef', 'tid', 'id']) {
        const v = url.searchParams.get(key);
        if (v && /^[A-Za-z0-9\-_]{6,64}$/.test(v)) return { reference: v };
      }
      const last = url.pathname.split('/').filter(Boolean).pop();
      if (last && /^[A-Za-z0-9\-_]{8,64}$/.test(last)) return { reference: last };
    } catch {
      /* URL ບໍ່ຖືກຕ້ອງ — ຂ້າມ */
    }
  }
  return {};
}
