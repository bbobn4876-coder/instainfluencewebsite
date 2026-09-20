import ExcelJS from "exceljs";
import { countryByCode } from "./countries";
import type { Influencer } from "./types";

type Column = {
  header: string;
  width: number;
  /** Numeric columns read better centred. */
  centred?: boolean;
};

const COLUMNS: Column[] = [
  { header: "Creator", width: 26 },
  { header: "IG handle", width: 22 },
  { header: "Profile URL", width: 38 },
  { header: "Geo", width: 26 },
  { header: "Followers", width: 13, centred: true },
  { header: "Median likes", width: 14, centred: true },
  { header: "Median comments", width: 17, centred: true },
  { header: "ER % (median)", width: 15, centred: true },
  { header: "Median reel views", width: 18, centred: true },
  { header: "Price", width: 12, centred: true },
];

const HEADER_FILL = "FF6D1330";

function geo(influencer: Influencer): string {
  const country = countryByCode(influencer.country);
  const name = country?.name ?? influencer.country;
  return influencer.city ? `${influencer.city}, ${name}` : name;
}

export function fileName(count: number): string {
  const day = new Date().toISOString().slice(0, 10);
  return `loomera-${count}-creators-${day}.xlsx`;
}

export async function toWorkbook(influencers: Influencer[]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "Loomera";
  const sheet = book.addWorksheet("Creators", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = COLUMNS.map((column) => ({ header: column.header, width: column.width }));

  for (const influencer of influencers) {
    sheet.addRow([
      influencer.fullName || influencer.username,
      `@${influencer.username}`,
      influencer.profileUrl,
      geo(influencer),
      influencer.followers || null,
      influencer.medianLikes ?? null,
      influencer.medianComments ?? null,
      influencer.engagementRate ? Number(influencer.engagementRate.toFixed(2)) : null,
      influencer.medianReelViews ?? null,
      // Price is filled in by hand after export.
      null,
    ]);
  }

  // Centre the numbers, keep the text columns left-aligned.
  COLUMNS.forEach((column, index) => {
    if (!column.centred) return;
    sheet.getColumn(index + 1).alignment = { horizontal: "center" };
  });
  sheet.getColumn(1).alignment = { horizontal: "left" };

  const header = sheet.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = {
      vertical: "middle",
      horizontal: COLUMNS[Number(cell.col) - 1]?.centred ? "center" : "left",
    };
  });

  sheet.getColumn(5).numFmt = "#,##0";
  sheet.getColumn(6).numFmt = "#,##0";
  sheet.getColumn(7).numFmt = "#,##0";
  sheet.getColumn(8).numFmt = "0.00";
  sheet.getColumn(9).numFmt = "#,##0";
  sheet.autoFilter = { from: "A1", to: { row: 1, column: COLUMNS.length } };

  const buffer = await book.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
