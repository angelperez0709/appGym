export function roundDecimal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return number;
  return Math.sign(number) * Math.round((Math.abs(number) + Number.EPSILON * Math.max(1, Math.abs(number))) * 100) / 100;
}

export function roundNumericFields(row) {
  if (!row) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'number' ? roundDecimal(value) : value]));
}
