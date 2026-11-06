// Генератор: DF-26 волна 1 — короткий список решений владельца (1 страница A4, GO-1)
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Footer, PageNumber, AlignmentType, WidthType, BorderStyle, ShadingType,
  TableLayoutType,
} = require("docx");
const fs = require("fs");

const PAL = {
  bg: "1A2330", accent: "D4875A", ink: "1A2330", body: "000000",
  table: { headerBg: "D4875A", headerText: "FFFFFF", innerLine: "DDD0C8", surface: "F8F0EB" },
};
const FONT = { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "SimHei" };

function h1(text) {
  return new Paragraph({
    spacing: { before: 240, after: 110, line: 300 },
    children: [new TextRun({ text, bold: true, size: 26, color: PAL.ink, font: FONT })],
  });
}
function bodyP(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 276, after: 80 },
    children: [new TextRun({ text, size: 21, bold: !!opts.bold, color: PAL.body, font: FONT })],
  });
}
function cellPara(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: 252, after: 30 },
    children: [new TextRun({ text: String(text), size: opts.size || 18, bold: !!opts.bold, color: opts.color || PAL.body, font: FONT })],
  });
}
function cell(text, opts = {}) {
  return new TableCell({
    children: [cellPara(text, opts)],
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    width: { size: opts.w, type: WidthType.PERCENTAGE },
  });
}
const row = (cells, i) => new TableRow({
  cantSplit: true,
  children: cells.map((c, idx) => cell(c.t, { ...c, fill: i % 2 === 1 ? PAL.table.surface : undefined })),
});
function table(header, rows, widths) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: PAL.accent },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: PAL.accent },
      left: { style: BorderStyle.NONE, size: 0, color: "auto" },
      right: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: PAL.table.innerLine },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    },
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: header.map((hh, idx) => cell(hh, { bold: true, color: PAL.table.headerText, fill: PAL.table.headerBg, w: widths[idx] })),
      }),
      ...rows.map((r, i) => row(r, i)),
    ],
  });
}

const children = [];
// Шапка-лента вместо обложки
children.push(new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  layout: TableLayoutType.FIXED,
  borders: {
    top: { style: BorderStyle.NONE, size: 0, color: "auto" }, bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
    left: { style: BorderStyle.NONE, size: 0, color: "auto" }, right: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
  },
  rows: [new TableRow({
    children: [new TableCell({
      shading: { type: ShadingType.CLEAR, fill: PAL.bg },
      margins: { top: 280, bottom: 280, left: 340, right: 340 },
      children: [
        new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "L O G I X  ·  D F - 2 6", size: 16, color: PAL.accent, font: FONT })] }),
        new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "DF-26, волна 1 — короткий список решений владельца", bold: true, size: 30, color: "FFFFFF", font: FONT })] }),
        new Paragraph({ children: [new TextRun({ text: "05.11.2026 · приложение к плану ред. 1.1 (раздел 9) · протокол рецензии: DF26-WAVE1-QUEUE21-PLAN-REVIEW-v1.0.md", size: 17, color: "B0B8C0", font: FONT })] }),
      ],
    })],
  })],
}));
children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));

children.push(bodyP("Как пользоваться: для старта остатка очереди №21 нужны Р-0 и подтверждения Р-1…Р-4 (блок А). Позиции блока Б отдельного решения не требуют. Допустим ответ одной строкой: «Разрешаю старт DF-26, волна 1; дефолты Р-1…Р-4 подтверждаю».", { bold: true }));

children.push(h1("Блок А — обязательные решения (до старта кодирования)"));
children.push(table(
  ["№", "Решение", "По умолчанию"],
  [
    [{ t: "Р-0", w: 9 }, { t: "Команда «Разрешаю старт DF-26, волна 1» (§6.1 п. 2) — единственный незакрытый пункт лестницы; без неё кодирование не возобновляется (D53, D56)", w: 63 }, { t: "Выдать команду — или удержать паузу", w: 28 }],
    [{ t: "Р-1", w: 9 }, { t: "Дефолты §14.1: О1 названия 4 видов; О2 логический тип в чек-листах; О6 строка в списке заявок; О7 справочник ТН ВЭД вне объёма; О8 лиды — плоский список", w: 63 }, { t: "Подтвердить (приняты D51; О1/О2 уже в каркасе)", w: 28 }],
    [{ t: "Р-2", w: 9 }, { t: "Мобильная граница №21: реестр, сводка и загрузка на 375 px; кнопки «Принять/Отклонить» (макет 10) — волна 2, зависят от статуса submitted", w: 63 }, { t: "Принять разрез; в отчёте гейта — протокол отклонения", w: 28 }],
    [{ t: "Р-3", w: 9 }, { t: "Среда гейта 1: песочница + локальная PostgreSQL 16.4; реальная тестовая БД — гейт 2 (№22)", w: 63 }, { t: "Да", w: 28 }],
    [{ t: "Р-4", w: 9 }, { t: "Версия релиза не назначается заранее (мастер-роадмап §8)", w: 63 }, { t: "Фиксировать при релизном отчёте", w: 28 }],
  ],
  [9, 63, 28],
));
children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));

children.push(h1("Блок Б — к сведения (решения не требуют)"));
children.push(table(
  ["№", "Позиция"],
  [
    [{ t: "И-1", w: 9 }, { t: "Расхождение «комментарий document-zip-plan.ts заявляет unit-тест — теста нет» закрывается задачей T21-04. Тесты выносятся в новые файлы (document-summary.test.ts, document-zip-plan.test.ts): document-package.test.ts уже 287 строк при лимите 300 (RULES 2.14); отклонение от наименования §13.1 фиксируется в отчёте гейта 1, замороженная спецификация не правится", w: 91 }],
    [{ t: "И-2", w: 9 }, { t: "Пересечение с потоком A ограничено event-registry.ts и order-counts.ts (согласованные расширения, §13.3); DF-24/DF-25 остаются на паузе (§6.2)", w: 91 }],
  ],
  [9, 91],
));
children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));

children.push(h1("Что происходит после ответа"));
children.push(bodyP("1. Владелец выдаёт Р-0 (и — при желании — правки Р-1…Р-4) → контрольная точка КТ-1."));
children.push(bodyP("2. Исполнитель выполняет T21-03 → {T21-02, T21-01, T21-04, T21-05} → T21-06 → T21-07 → T21-08 (≈3–4 рабочих дня; при одном исполнителе — линейный порядок плана)."));
children.push(bodyP("3. Гейт 1 сдаётся целиком на приёмку → решение владельца «Принимаю гейт 1; разрешаю DF-26, волну 2» или возврат с замечаниями (КТ-5). Волну 2 этот план не запускает; production deployment — только отдельной командой."));
children.push(new Paragraph({ spacing: { before: 200 }, border: { top: { style: BorderStyle.SINGLE, size: 2, color: PAL.accent, space: 8 } }, children: [new TextRun({ text: "Полные формулировки вопросов и контекст — раздел 9 плана DF26-WAVE1-QUEUE21-PLAN-v1.1.md; протокол рецензии — DF26-WAVE1-QUEUE21-PLAN-REVIEW-v1.0.md.", size: 17, italics: true, color: "666666", font: FONT })] }));

const doc = new Document({
  creator: "LOGIX sandbox agent",
  title: "DF-26 волна 1 — короткий список решений владельца",
  styles: { default: { document: { run: { font: FONT, size: 21, color: PAL.body }, paragraph: { spacing: { line: 288 } } } } },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 680, bottom: 680, left: 1200, right: 1200 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "808080", font: FONT })] })] }) },
    children,
  }],
});

const OUT = "/home/z/my-project/download/DF26-WAVE1/DF26-WAVE1-OWNER-DECISIONS-SHORT-v1.0.docx";
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("OK:", OUT, buf.length, "bytes"); });
