// Проверка содержимого файла по сигнатуре (magic bytes). MIME из формы
// присылает браузер, ему нельзя верить: HTML, переименованный в .pdf,
// иначе будет храниться и отдаваться как «PDF» (E0-07).

type Family = 'pdf' | 'png' | 'jpeg' | 'webp' | 'ole' | 'zip'

const MIME_FAMILY: Record<string, Family> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'application/msword': 'ole',
  'application/vnd.ms-excel': 'ole',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'zip',
  'application/zip': 'zip',
}

// Если браузер не прислал тип (бывает на Windows для .docx/.xlsx),
// определяем его по сигнатуре + расширению
const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
}

function startsWith(b: Uint8Array, sig: number[], offset = 0): boolean {
  if (b.length < offset + sig.length) return false
  return sig.every((v, i) => b[offset + i] === v)
}

export function detectFamily(b: Uint8Array): Family | null {
  // PDF допускает мусор перед заголовком — ищем «%PDF-» в первых 1024 байтах
  const head = b.subarray(0, 1024)
  for (let i = 0; i + 5 <= head.length; i++) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46 && head[i + 4] === 0x2d) {
      return 'pdf'
    }
  }
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole'
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06])) return 'zip'
  return null
}

/**
 * Итоговый MIME файла или null, если содержимое не совпадает с
 * заявленным типом / не входит в белый список.
 */
export function resolveFileMime(declared: string, fileName: string, bytes: Uint8Array): string | null {
  const family = detectFamily(bytes)
  if (!family) return null

  let mime = declared
  if (!mime || mime === 'application/octet-stream') {
    const ext = fileName.toLowerCase().split('.').pop() ?? ''
    mime = EXT_MIME[ext] ?? ''
  }
  const expected = MIME_FAMILY[mime]
  return expected === family ? mime : null
}
