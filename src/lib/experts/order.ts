/** Move `from` onto `to`'s place in the list, shifting the items in between, as when dragging. */
export function moveBefore(list: string[], from: string, to: string): string[] {
  if (from === to) return list;
  const out = list.filter((x) => x !== from);
  const at = out.indexOf(to);
  if (at < 0) return list;
  // Dragging rightward/downward drops after the target, leftward/upward before it.
  const after = list.indexOf(from) < list.indexOf(to);
  out.splice(after ? at + 1 : at, 0, from);
  return out;
}
