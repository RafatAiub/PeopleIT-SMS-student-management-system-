/** Writes rows to an .xlsx file. xlsx is imported at the moment of use. */
export async function exportSheet(rows: Record<string, string | number | null>[], fileName: string, sheetName = 'Sheet1') {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
