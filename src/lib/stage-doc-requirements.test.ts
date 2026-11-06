import { describe, it, expect } from 'vitest'
import {
  DEFAULT_STAGE_REQUIREMENT_SEED,
  awaitingDocumentOutcome,
  missingKinds,
  STAGE_DOC_PROVIDER_LABELS,
} from '@/lib/stage-doc-requirements'
import {
  DOCUMENT_KINDS,
  DOC_PROVIDER_LABELS,
  type DocumentKind,
} from '@/lib/document-constants'

// ─── DF-14: чек-листы этапов — чистое ядро ──────────────────────────
// missingKinds — общая точка истины для правила 8 «у кого мяч»
// (waiting.ts), Пульса (pulse-db.ts) и 409-текста блокировки этапа
// (missingBlockingDocsForStage). Расхождение исключено по построению —
// здесь фиксируется сама семантика.

const blocking = (kind: DocumentKind, providedBy: 'client' | 'broker' | 'staff' = 'client') => ({
  kind,
  providedBy,
  isBlocking: true,
})

describe('missingKinds (DF-14)', () => {
  it('без требований — недостающих нет', () => {
    expect(missingKinds([], [])).toEqual([])
  })

  it('рекомендованное требование (isBlocking=false) не создаёт недостающих', () => {
    expect(
      missingKinds([{ kind: 'customs_declaration', isBlocking: false }], [])
    ).toEqual([])
  })

  it('блокирующее без финального документа — недостающий', () => {
    expect(missingKinds([blocking('customs_declaration')], [])).toEqual(['customs_declaration'])
  })

  it('финальный документ вида закрывает требование', () => {
    expect(
      missingKinds([blocking('customs_declaration')], ['customs_declaration'])
    ).toEqual([])
  })

  it('несколько блокирующих — порядок справочника DOCUMENT_KINDS', () => {
    const out = missingKinds(
      [blocking('customs_declaration', 'broker'), blocking('commercial_invoice')],
      []
    )
    expect(out).toEqual(['commercial_invoice', 'customs_declaration'])
  })

  it('финал закрывает только свой вид (частичное покрытие)', () => {
    const out = missingKinds(
      [blocking('customs_declaration', 'broker'), blocking('commercial_invoice')],
      ['commercial_invoice']
    )
    expect(out).toEqual(['customs_declaration'])
  })

  it('дубликаты видов в требованиях не дублируют недостающие', () => {
    expect(
      missingKinds([blocking('other', 'staff'), blocking('other', 'client')], [])
    ).toEqual(['other'])
  })
})

describe('awaitingDocumentOutcome (DF-14, правило 8)', () => {
  it('ничего не недостаёт → null (правило 7 продолжает держать мяч)', () => {
    expect(awaitingDocumentOutcome([blocking('other')], ['other'])).toBeNull()
    expect(awaitingDocumentOutcome([], [])).toBeNull()
  })

  it('недостаёт → первый недостающий по справочнику с его providedBy', () => {
    expect(
      awaitingDocumentOutcome(
        [blocking('customs_declaration', 'broker'), blocking('commercial_invoice', 'client')],
        []
      )
    ).toEqual({ kind: 'commercial_invoice', providedBy: 'client' })
  })

  it('рекомендованные не порождают исход правила 8', () => {
    expect(
      awaitingDocumentOutcome([{ kind: 'other', providedBy: 'staff', isBlocking: false }], [])
    ).toBeNull()
  })
})

describe('дефолты чек-листа (D5, сид миграции df_14)', () => {
  it('пары этап+вид уникальны', () => {
    const pairs = DEFAULT_STAGE_REQUIREMENT_SEED.map((r) => `${r.stageCode}:${r.kind}`)
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('виды валидны и принадлежат справочнику D5', () => {
    for (const r of DEFAULT_STAGE_REQUIREMENT_SEED) {
      expect(DOCUMENT_KINDS).toContain(r.kind)
    }
  })

  it('поставщики — из словаря DocProvider (D35: таможенный контур — брокер)', () => {
    for (const r of DEFAULT_STAGE_REQUIREMENT_SEED) {
      expect(DOC_PROVIDER_LABELS[r.providedBy]).toBeTruthy()
      expect(r.providedBy).toBe('broker')
    }
  })

  it('подписи поставщиков полные (UI справочника и слотов)', () => {
    expect(STAGE_DOC_PROVIDER_LABELS).toEqual(DOC_PROVIDER_LABELS)
  })
})
