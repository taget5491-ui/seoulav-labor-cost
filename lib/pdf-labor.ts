import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export type LaborExtractionMatch = {
  page: number;
  amount: number;
  method: "second_amount";
};

export type LaborExtractionResult = {
  total: number;
  pageCount: number;
  matches: LaborExtractionMatch[];
};

type PositionedText = {
  text: string;
  x: number;
  y: number;
  width: number;
};

function compact(value: string) {
  return value.replace(/\s+/g, "");
}

function parseAmount(value: string) {
  const normalized = value.replace(/[₩원\s,]/g, "");
  if (!/^\(?-?\d+\)?$/.test(normalized)) return null;
  const negative = normalized.startsWith("-") || (normalized.startsWith("(") && normalized.endsWith(")"));
  const digits = normalized.replace(/\D/g, "");
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? (negative ? -amount : amount) : null;
}

function groupRows(items: PositionedText[]) {
  const rows: PositionedText[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - item.y) <= 3);
    if (row) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => row.sort((a, b) => a.x - b.x));
}

function findLaborAmount(rows: PositionedText[][]) {
  const targetRows = rows.filter((row) => compact(row.map((item) => item.text).join(" ")).includes("직접비계"));
  const results: Array<{ amount: number; method: "second_amount" }> = [];

  for (const row of targetRows) {
    const numericItems = row.map((item) => ({ item, amount: parseAmount(item.text) })).filter((candidate): candidate is { item: PositionedText; amount: number } => candidate.amount !== null);
    if (numericItems.length >= 2) results.push({ amount: numericItems[1].amount, method: "second_amount" });
  }

  return results;
}

export async function extractDirectCostLabor(file: File): Promise<LaborExtractionResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const document = await loadingTask.promise;
  const pageCount = document.numPages;
  const matches: LaborExtractionMatch[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: PositionedText[] = content.items.flatMap((raw) => {
        if (!("str" in raw) || !("transform" in raw)) return [];
        const text = String(raw.str).trim();
        if (!text) return [];
        return [{ text, x: Number(raw.transform[4]), y: Number(raw.transform[5]), width: Number("width" in raw ? raw.width : 0) }];
      });
      for (const result of findLaborAmount(groupRows(items))) matches.push({ page: pageNumber, ...result });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return { total: matches.reduce((sum, match) => sum + match.amount, 0), pageCount, matches };
}
