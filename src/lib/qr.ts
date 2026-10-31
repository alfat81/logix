// ─── DF-09: QR-энкодер для otpauth:// — чистый TS, без зависимостей ──
// Зачем: секционка TOTP показывает QR аутентификатору (карточка DF-09);
// новые зависимости без согласования запрещены (§4.3), готового
// генератора в проекте нет (G1). Реализован байтовый режим, уровень
// коррекции M, версии 1–8 (URI входа ~125 байт — с запасом), выбор
// маски по штрафу ISO 18004. Верный ли QR — проверяется декодером
// zxing-cpp в песочнице (scripts/verify_qr.py) и unit-тестами
// структуры; в рантайме энкодер детерминирован.

const EC_FORMAT_BITS = 0 // уровень M: 00
// [blocks][dataLen] на блок + EC на блок (уровень M, ISO 18004 табл. 13–14)
const BLOCKS_M: { blocks: number[]; ec: number }[] = [
  { blocks: [16], ec: 10 },
  { blocks: [28], ec: 16 },
  { blocks: [44], ec: 26 },
  { blocks: [32, 32], ec: 18 },
  { blocks: [43, 43], ec: 24 },
  { blocks: [27, 27, 27, 27], ec: 16 },
  { blocks: [31, 31, 31, 31], ec: 18 },
  { blocks: [38, 38, 39, 39], ec: 22 },
]
const ALIGNMENT: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
]

// GF(2^8), примитивный многочлен 0x11D — арифметика Рида–Соломона.
const EXP = new Int32Array(512)
const LOG = new Int32Array(256)
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x
  LOG[x] = i
  x <<= 1
  if (x & 0x100) x ^= 0x11d
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
const gfMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]])

function rsGenerator(degree: number): number[] {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], EXP[i])
      next[j + 1] ^= poly[j]
    }
    poly = next
  }
  return poly.reverse() // старшая степень первой
}

function rsEncode(data: number[], degree: number): number[] {
  const gen = rsGenerator(degree)
  const rem = data.concat(new Array(degree).fill(0))
  for (let i = 0; i < data.length; i++) {
    const factor = rem[i]
    if (factor === 0) continue
    for (let j = 1; j < gen.length; j++) rem[i + j] ^= gfMul(gen[j], factor)
  }
  return rem.slice(data.length)
}

class BitBuffer {
  bits: number[] = []
  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1)
  }
  toBytes(): number[] {
    const out: number[] = []
    for (let i = 0; i < this.bits.length; i += 8) {
      let b = 0
      for (let j = 0; j < 8 && i + j < this.bits.length; j++) b = (b << 1) | this.bits[i + j]
      if (this.bits.length - i < 8) b <<= 8 - (this.bits.length - i)
      out.push(b)
    }
    return out
  }
}

const MASKS: ((row: number, col: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

export type QrMatrix = { size: number; modules: boolean[][] }

export function encodeQr(text: string): QrMatrix {
  const payload = Buffer.from(text, 'utf8')
  let version = 0
  for (let v = 1; v <= 8; v++) {
    if (payload.length <= BLOCKS_M[v - 1].blocks.reduce((a, b) => a + b, 0) - 2) {
      version = v
      break
    }
  }
  if (version === 0) throw new Error('QR: строка длиннее 152 байт (версии 1–8, уровень M)')
  const size = version * 4 + 17
  const blocks = BLOCKS_M[version - 1]
  const dataCw = blocks.blocks.reduce((a, b) => a + b, 0)

  // Битовый поток: режим 0100, счётчик 8 бит (v1–9), данные, терминатор.
  const bb = new BitBuffer()
  bb.push(0b0100, 4)
  bb.push(payload.length, 8)
  for (const byte of payload) bb.push(byte, 8)
  const capacityBits = dataCw * 8
  bb.push(0, Math.min(4, capacityBits - bb.bits.length))
  if (bb.bits.length % 8 !== 0) bb.push(0, 8 - (bb.bits.length % 8))
  const bytes = bb.toBytes()
  for (let pad = 0xec; bytes.length < dataCw; pad = pad === 0xec ? 0x11 : 0xec) bytes.push(pad)

  // Блоки данных + Рид–Соломон, чересстрочная запись.
  const dataBlocks: number[][] = []
  const ecBlocks: number[][] = []
  let offset = 0
  for (const len of blocks.blocks) {
    const chunk = bytes.slice(offset, offset + len)
    offset += len
    dataBlocks.push(chunk)
    ecBlocks.push(rsEncode(chunk, blocks.ec))
  }
  const codewords: number[] = []
  const maxLen = Math.max(...blocks.blocks)
  for (let i = 0; i < maxLen; i++)
    for (const b of dataBlocks) if (i < b.length) codewords.push(b[i])
  for (let i = 0; i < blocks.ec; i++) for (const b of ecBlocks) codewords.push(b[i])

  // Функциональные модули: искатели, разделители, синхро, выравнивание.
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const set = (col: number, row: number, dark: boolean): void => {
    fn[row][col] = true
    modules[row][col] = dark
  }
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const finder = (cx: number, cy: number): void => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        const x = cx + dx
        const y = cy + dy
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4)
      }
  }
  finder(3, 3)
  finder(size - 4, 3)
  finder(3, size - 4)
  for (let i = 8; i < size - 8; i++) {
    set(i, 6, i % 2 === 0)
    set(6, i, i % 2 === 0)
  }
  // Выравнивающие шаблоны: центры — таблица версии; три угловых центра
  // (совпадают с искателями) пропускаются, как у всех реализаций спецификации.
  const centers = ALIGNMENT[version - 1]
  const last = centers.length - 1
  for (let i = 0; i < centers.length; i++)
    for (let j = 0; j < centers.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue
      const cy = centers[i]
      const cx = centers[j]
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  // Тёмный модуль (спецификация): столбец 8, строка size−8.
  set(8, size - 8, true)

  // Форматная информация: 15 бит = (00_MASK) с BCH и маской 0x5412.
  const drawFormat = (maskId: number): void => {
    const fmt = (EC_FORMAT_BITS << 3) | maskId
    let rem = fmt << 10
    for (let i = 4; i >= 0; i--) if ((rem >> (i + 10)) & 1) rem ^= 0x537 << i
    const bits = ((fmt << 10) | rem) ^ 0x5412
    const put = (col: number, row: number, bit: number): void => set(col, row, bit === 1)
    for (let i = 0; i <= 5; i++) put(8, i, (bits >> i) & 1)
    put(8, 7, (bits >> 6) & 1)
    put(8, 8, (bits >> 7) & 1)
    put(7, 8, (bits >> 8) & 1)
    for (let i = 9; i < 15; i++) put(14 - i, 8, (bits >> i) & 1)
    for (let i = 0; i < 8; i++) put(size - 1 - i, 8, (bits >> i) & 1)
    for (let i = 8; i < 15; i++) put(8, size - 15 + i, (bits >> i) & 1)
  }

  // Версионная информация (v ≥ 7): 18 бит с BCH 0x1F25, два блока 3×6.
  const drawVersion = (): void => {
    if (version < 7) return
    let rem = version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const bits = (version << 12) | rem
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      set(a, b, ((bits >> i) & 1) === 1)
      set(b, a, ((bits >> i) & 1) === 1)
    }
  }
  drawVersion()

  // Данные зигзагом снизу-справа, пара столбцов за проход, минуя столбец 6.
  const placeData = (maskId: number): void => {
    let bitIdx = 0
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let vert = 0; vert < size; vert++)
        for (let j = 0; j < 2; j++) {
          const col = right - j
          const upward = ((right + 1) & 2) === 0
          const row = upward ? size - 1 - vert : vert
          if (!fn[row][col] && bitIdx < codewords.length * 8) {
            const bit = (codewords[bitIdx >> 3] >>> (7 - (bitIdx & 7))) & 1
            modules[row][col] = (bit === 1) !== MASKS[maskId](row, col)
            bitIdx++
          }
        }
    }
  }

  const penalty = (): number => {
    let score = 0
    const dark = (r: number, c: number): boolean =>
      r >= 0 && r < size && c >= 0 && c < size && modules[r][c]
    for (let r = 0; r < size; r++) {
      let run = 1
      for (let c = 1; c <= size; c++) {
        if (c < size && modules[r][c] === modules[r][c - 1]) run++
        else {
          if (run >= 5) score += 3 + run - 5
          run = 1
        }
      }
    }
    for (let c = 0; c < size; c++) {
      let run = 1
      for (let r = 1; r <= size; r++) {
        if (r < size && modules[r][c] === modules[r - 1][c]) run++
        else {
          if (run >= 5) score += 3 + run - 5
          run = 1
        }
      }
    }
    for (let r = 0; r < size - 1; r++)
      for (let c = 0; c < size - 1; c++) {
        const v = modules[r][c]
        if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1])
          score += 3
      }
    // N3: паттерн 1011101 с 4 светлыми с любой стороны, обе ориентации
    const pat1 = [true, false, true, true, true, false, true]
    for (let r = 0; r < size; r++)
      for (let c = 0; c <= size - 11; c++) {
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
        ] as const) {
          let ok = true
          for (let k = 0; k < 7; k++) if (dark(r + dr * k, c + dc * k) !== pat1[k]) ok = false
          if (
            ok &&
            !dark(r + dr * -1, c + dc * -1) &&
            !dark(r + dr * -2, c + dc * -2) &&
            !dark(r + dr * -3, c + dc * -3) &&
            !dark(r + dr * -4, c + dc * -4)
          )
            score += 40
          let ok2 = true
          for (let k = 0; k < 7; k++) if (dark(r + dr * k, c + dc * k) !== pat1[k]) ok2 = false
          if (
            ok2 &&
            !dark(r + dr * 7, c + dc * 7) &&
            !dark(r + dr * 8, c + dc * 8) &&
            !dark(r + dr * 9, c + dc * 9) &&
            !dark(r + dr * 10, c + dc * 10)
          )
            score += 40
        }
      }
    let darkCount = 0
    for (const row of modules) for (const m of row) if (m) darkCount++
    // N4: отклонение доли тёмных от 50% — шаг 5%, шаг стоит 10.
    score +=
      Math.floor(Math.abs(darkCount * 20 - size * size * 10) / (size * size * 5)) * 10
    return score
  }

  let best = -1
  let bestScore = Infinity
  const snapshot = modules.map((r) => [...r])
  for (let maskId = 0; maskId < 8; maskId++) {
    drawFormat(maskId)
    placeData(maskId)
    const s = penalty()
    if (s < bestScore) {
      bestScore = s
      best = maskId
    }
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) if (!fn[r][c]) modules[r][c] = snapshot[r][c]
  }
  drawFormat(best)
  placeData(best)
  return { size, modules }
}

// SVG с тихой зоной 4 модуля: path по горизонтальным прогонам тёмных.
// Цвет — currentColor (токен Ink кабинета), фон тихой зоны даёт
// контейнер с bg-white в компоненте: IC-09 — без hex вне globals.css,
// контраст сканирования QR обеспечивают тёмный Ink и белый фон.
export function qrSvg(text: string): string {
  const { size, modules } = encodeQr(text)
  const quiet = 4
  let d = ''
  for (let r = 0; r < size; r++) {
    let c = 0
    while (c < size) {
      if (modules[r][c]) {
        let run = 1
        while (c + run < size && modules[r][c + run]) run++
        d += `M${c + quiet} ${r + quiet}h${run}v1h${-run}z`
        c += run
      } else c++
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size + quiet * 2} ${size + quiet * 2}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR-код">` +
    `<path d="${d}" fill="currentColor"/></svg>`
  )
}
