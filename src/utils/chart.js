/* Chart colours, validated (dataviz validate_palette.js, dark surface #131316):
   four hues that stay distinct for normal and colour-blind vision when
   neighbours, plus a neutral for "Other". Parts beyond four fold into Other. */
export const CHART_SLOTS = ['#3987e5', '#d95926', '#199e70', '#c98500'];
export const CHART_OTHER = '#6c6c75';

/** Top 4 parts + "Other", each with its chart colour. items: [{ id, label, value }] */
export function topParts(items, max = 4) {
  const list = items.filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  const top = list.slice(0, max).map((x, i) => ({ ...x, color: CHART_SLOTS[i] }));
  const rest = list.slice(max);
  if (rest.length) top.push({ id: '__other', label: rest.length === 1 ? rest[0].label : `Other (${rest.length})`, value: rest.reduce((t, x) => t + x.value, 0), color: CHART_OTHER });
  return top;
}
