// Генератор: DF-26 волна 1 — план реализации оставшегося объёма очереди №21
// Рецепт обложки R1 (Pure Paragraph Left), палитра GO-1, шрифт Liberation Sans (кириллица)
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, NumberFormat, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, SectionType, TableOfContents,
  PageBreak, LevelFormat, TableLayoutType,
} = require("docx");
const fs = require("fs");
const { S1 } = require("./content1.js");
const { S2 } = require("./content2.js");
const { S3 } = require("./content3.js");

// ---------- Палитра GO-1 (Graphite Orange — планы/PRD) ----------
const PAL = {
  bg: "1A2330", accent: "D4875A",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078" },
  table: { headerBg: "D4875A", headerText: "FFFFFF", accentLine: "D4875A", innerLine: "DDD0C8", surface: "F8F0EB" },
  ink: "1A2330", body: "000000", muted: "888888",
};
const FONT = { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "SimHei" };

const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: "auto" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
  left: { style: BorderStyle.NONE, size: 0, color: "auto" },
  right: { style: BorderStyle.NONE, size: 0, color: "auto" },
};
const allNoBorders = Object.assign({}, noBorders, {
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
});

// ---------- calcTitleLayout (кириллица/латиница: ширина символа ≈ pt×12 twips) ----------
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([..."，。、；：！？", ..."-_—–·/:", ..." \t"]);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += " " + last;
  }
  return lines;
}
function calcTitleLayout(title, maxWidthTwips, preferredPt = 36, minPt = 24) {
  const charWidth = (pt) => pt * 12; // кириллица
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) { lines = splitTitleLines(title, charsPerLine(minPt)); titlePt = minPt; }
  return { titlePt, titleLines: lines };
}
function calcCoverSpacing(p) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0 } = p;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const safeRemaining = Math.max(usableHeight - contentHeight, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// ---------- Обложка R1 ----------
function buildCoverR1(config) {
  const P = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 36, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join(" "), size: 18, color: P.accent, font: FONT, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: P.cover.titleColor, font: FONT })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 800, line: 312 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: P.cover.subtitleColor, font: FONT })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200, right: padR }, spacing: { after: 80, line: 276 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 21, color: P.cover.metaColor, font: FONT })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: P.cover.footerColor, font: FONT }),
      new TextRun({ text: "                                        ", size: 16, font: FONT }),
      new TextRun({ text: config.footerRight || "", size: 16, color: P.cover.footerColor, font: FONT }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders, verticalAlign: "top",
        children,
      })],
    })],
  })];
}

// ---------- Компоненты тела ----------
function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, size: 30, color: PAL.ink, font: FONT })],
  });
}
function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120, line: 312 },
    children: [new TextRun({ text, bold: true, size: 26, color: PAL.ink, font: FONT })],
  });
}
function bodyP(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 709 },
    spacing: { line: 312, after: 120 },
    children: [new TextRun({ text, size: 24, color: PAL.body, font: FONT })],
  });
}
function noteP(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 288, before: 80, after: 160 },
    indent: { left: 340 },
    border: { left: { style: BorderStyle.SINGLE, size: 6, color: PAL.accent, space: 10 } },
    children: [new TextRun({ text, size: 20, italics: true, color: "505050", font: FONT })],
  });
}
function bulletP(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    bullet: { level: 0 },
    spacing: { line: 312, after: 80 },
    children: [new TextRun({ text, size: 24, color: PAL.body, font: FONT })],
  });
}
function numP(text, ref) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    numbering: { reference: ref, level: 0 },
    spacing: { line: 312, after: 80 },
    children: [new TextRun({ text, size: 24, color: PAL.body, font: FONT })],
  });
}
function captionP(text) {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 240, after: 100, line: 288 },
    children: [new TextRun({ text, bold: true, size: 21, color: PAL.ink, font: FONT })],
  });
}
function cellPara(text, opts) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: 264, after: 40 },
    children: [new TextRun({ text: String(text), size: opts.size, bold: !!opts.bold, color: opts.color || PAL.body, font: FONT })],
  });
}
function buildTable(block) {
  const size = block.size || 19;
  const widths = block.widths;
  const out = [];
  if (block.title) out.push(captionP(block.title));
  const headerRow = new TableRow({
    tableHeader: true, cantSplit: true,
    children: block.header.map((h, idx) => new TableCell({
      children: [cellPara(h, { size, bold: true, color: PAL.table.headerText })],
      shading: { type: ShadingType.CLEAR, fill: PAL.table.headerBg },
      margins: { top: 70, bottom: 70, left: 110, right: 110 },
      width: { size: widths[idx], type: WidthType.PERCENTAGE },
    })),
  });
  const dataRows = block.rows.map((r, ri) => new TableRow({
    cantSplit: true,
    children: r.map((c, idx) => new TableCell({
      children: [cellPara(c, { size })],
      shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: PAL.table.surface } : undefined,
      margins: { top: 60, bottom: 60, left: 110, right: 110 },
      width: { size: widths[idx], type: WidthType.PERCENTAGE },
    })),
  }));
  out.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: PAL.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: PAL.table.accentLine },
      left: { style: BorderStyle.NONE, size: 0, color: "auto" },
      right: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: PAL.table.innerLine },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    },
    rows: [headerRow, ...dataRows],
  }));
  out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  return out;
}

function renderBlocks(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.t === "h1") out.push(heading1(b.text));
    else if (b.t === "h2") out.push(heading2(b.text));
    else if (b.t === "p") out.push(bodyP(b.text));
    else if (b.t === "note") out.push(noteP(b.text));
    else if (b.t === "bullets") b.items.forEach((it) => out.push(bulletP(it)));
    else if (b.t === "numlist") b.items.forEach((it) => out.push(numP(it, b.ref)));
    else if (b.t === "table") out.push(...buildTable(b));
  }
  return out;
}

// ---------- Сборка ----------
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

const bodyHeader = new Header({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "DF-26 волна 1 · план реализации оставшегося объёма очереди №21 · 05.11.2026", size: 16, color: "9A9A9A", font: FONT })],
  })],
});
const pageFooter = new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: FONT })],
  })],
});

const coverConfig = {
  title: "DF-26 волна 1: план реализации оставшегося объёма очереди №21",
  subtitle: "Предстартовая аналитическая подготовка · на проверку владельцу",
  englishLabel: "LOGIX · DF-26",
  metaLines: [
    "Основание: команда владельца от 05.11.2026",
    "Нормативная база: DOC-CENTER-SPEC-v1.6 (D55) · мастер-роадмап · D51–D57",
    "Редакция 1.1 (рецензия и исправление зависимостей)",
    "Статус: анализ и план; реализация не начата; deployment не разрешён",
    "Исполнитель: ИИ-агент (песочница) · 05.11.2026",
  ],
  footerLeft: "LOGIX — единый центр документов заявки",
  footerRight: "05.11.2026",
  palette: PAL,
};

const tocChildren = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 360 },
    children: [new TextRun({ text: "Содержание", bold: true, size: 32, color: PAL.ink, font: FONT })],
  }),
  new TableOfContents("Оглавление", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({
      text: "Примечание: оглавление построено на полях документа. После редактирования обновите номера страниц: щёлкните по оглавлению правой кнопкой мыши и выберите «Обновить поле».",
      italics: true, size: 18, color: "888888", font: FONT,
    })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
];

const bodyChildren = [...renderBlocks(S1), ...renderBlocks(S2), ...renderBlocks(S3)];

const doc = new Document({
  creator: "LOGIX sandbox agent",
  title: "DF-26 волна 1: план реализации оставшегося объёма очереди №21",
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 24, color: PAL.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: FONT, size: 30, bold: true, color: PAL.ink },
        paragraph: { spacing: { before: 400, after: 160, line: 312 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: FONT, size: 26, bold: true, color: PAL.ink },
        paragraph: { spacing: { before: 280, after: 120, line: 312 }, outlineLevel: 1 },
      },
    },
  },
  numbering: {
    config: [{
      reference: "seq-list",
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    }],
  },
  sections: [
    { // Секция 1: обложка — поля 0, без колонтитулов
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1(coverConfig),
    },
    { // Секция 2: содержание — без номера страницы
      properties: { type: SectionType.NEXT_PAGE, page: { size: pgSize, margin: pgMargin } },
      children: tocChildren,
    },
    { // Секция 3: тело — арабская нумерация с 1
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: bodyHeader },
      footers: { default: pageFooter },
      children: bodyChildren,
    },
  ],
});

const OUT = "/home/z/my-project/download/DF26-WAVE1/DF26-WAVE1-QUEUE21-PLAN-v1.1.docx";
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("OK:", OUT, buf.length, "bytes");
});
