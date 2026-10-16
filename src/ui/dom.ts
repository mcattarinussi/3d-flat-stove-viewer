type Child = Node | string | number | null | undefined | false;

/**
 * Tiny element factory. Props starting with "on" become listeners, "class" sets className,
 * known DOM properties are assigned (in insertion order: put `type`, `min`, `max` before `value`),
 * anything else becomes an attribute.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') node.className = String(v);
    else if (k in node) (node as unknown as Record<string, unknown>)[k] = v;
    else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'number' ? String(c) : c);
  }
  return node;
}
