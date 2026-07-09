type Identified = {
  id: string;
};

export function normalizeDisplayName(_value: string): string {
  const value = _value.trim();
  if (!value) {
    throw new Error("请输入展示名称。");
  }
  if (value.length > 80) {
    throw new Error("展示名称不能超过 80 个字符。");
  }
  return value;
}

export async function createConversationAndSelect<T extends Identified>(
  _create: (title: string) => Promise<T>,
  _title: string,
  _items: T[],
): Promise<{ items: T[]; active: T }> {
  const title = _title.trim() || "新督导会话";
  const active = await _create(title);
  return {
    items: [active, ..._items.filter((item) => item.id !== active.id)],
    active,
  };
}

export async function deleteConversationAndSelect<T extends Identified>(
  _remove: (id: string) => Promise<unknown>,
  _items: T[],
  _activeId: string | null,
  _deletedId: string,
): Promise<{ items: T[]; active: T | null }> {
  await _remove(_deletedId);
  const items = _items.filter((item) => item.id !== _deletedId);
  const active = _activeId === _deletedId
    ? items[0] ?? null
    : items.find((item) => item.id === _activeId) ?? items[0] ?? null;
  return { items, active };
}
