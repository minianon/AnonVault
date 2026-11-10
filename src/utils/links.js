/* Small helpers shared by editors: dates as YYYY-MM-DD and link tidying. */

const pad2 = n => String(n).padStart(2, '0');
export const ymdLocal = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const withProtocol = u => (/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`);
export const hostOf = u => { try { return new URL(withProtocol(u)).hostname.replace(/^www\./, ''); } catch { return u; } };
