function csvCell(value) {
  if (value === null || value === undefined) return "";

  let text = String(value);
  // Spreadsheet apps can execute values that begin with a formula marker.
  if (typeof value === "string" && /^[\s\uFEFF]*[=+\-@]/u.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

module.exports = { toCsv };
