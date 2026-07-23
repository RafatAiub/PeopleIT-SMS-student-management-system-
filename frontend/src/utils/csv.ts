// Minimal client-side CSV export helper shared by attendance pages (Admin
// Control Center Reports tab and the Student/Guardian Attendance Portal).
// Serializes rows to a Blob and triggers a download — no server round-trip.
export const downloadCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
  const escapeCell = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(escapeCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
