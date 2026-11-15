import type { SerializedEditorState } from "lexical"

/**
 * Convert consecutive flat "list-item" nodes (from old flat-list format) into
 * nested "list" > "listitem" structure that Lexical's built-in @lexical/list expects.
 * Already-nested "list" nodes pass through unchanged.
 */
function nestFlatListItems(flatItems: any[], listType: string): any {
  // Build a nested list node from flat items sharing the same listType
  const tag = listType === "number" ? "ol" : "ul"
  const root: any = {
    type: "list",
    listType,
    tag,
    start: 1,
    direction: null,
    format: "",
    version: 1,
    children: [],
  }

  // Group items by indent level to create nesting
  let i = 0
  while (i < flatItems.length) {
    const item = flatItems[i]
    const indent = item.indent ?? 0

    // Collect children that belong nested under this item (higher indent)
    const nestedItems: any[] = []
    let j = i + 1
    while (j < flatItems.length && (flatItems[j].indent ?? 0) > indent) {
      nestedItems.push(flatItems[j])
      j++
    }

    // Build the listitem
    const listitem: any = {
      type: "listitem",
      value: root.children.length + 1,
      checked: item.checked ?? false,
      direction: item.direction ?? null,
      format: item.format ?? "",
      version: 1,
      children: migrateChildren(item.children || []),
    }

    // If there are nested items, create a sub-list
    if (nestedItems.length > 0) {
      // Decrease indent by 1 for nested items
      const adjusted = nestedItems.map((n) => ({ ...n, indent: (n.indent ?? 0) - indent - 1 }))
      const subListType = nestedItems[0].listType || listType
      listitem.children.push(nestFlatListItems(adjusted, subListType))
    }

    root.children.push(listitem)
    i = j
  }

  return root
}

/**
 * Migrate children: remove legacy nodes and convert old flat "list-item" nodes
 * into proper nested list/listitem structure.
 */
function migrateChildren(children: any[]): any[] {
  const result: any[] = []

  let i = 0
  while (i < children.length) {
    const child = children[i]

    // Keep the exact code bytes when upgrading legacy decorator nodes.
    if (child.type === "code-snippet" || child.type === "executable-code-block") {
      const code = typeof child.code === "string" ? child.code
        : typeof child.text === "string" ? child.text
        : JSON.stringify(child)
      result.push({ type: "code-block", version: 1, code,
        language: typeof child.language === "string" ? child.language : "" })
      i++
      continue
    }
    // An interrupted request cannot resume after a reload. Restore its source
    // link instead of persisting an unrecoverable spinner.
    if (child.type === "loading-placeholder" && typeof child.sourceUrl === "string" && child.sourceUrl) {
      result.push({ type: "paragraph", version: 1, format: "", indent: 0, direction: null,
        children: [{ type: "link", version: 1, url: child.sourceUrl, format: "", indent: 0, direction: null,
          children: [{ type: "text", version: 1, text: child.sourceUrl, format: 0, detail: 0, mode: "normal", style: "" }] }] })
      i++
      continue
    }

    if (child.type === "list-item") {
      // Collect consecutive flat list-item nodes
      const group: any[] = []
      while (i < children.length && children[i].type === "list-item") {
        group.push(children[i])
        i++
      }
      const listType = group[0].listType || "bullet"
      result.push(nestFlatListItems(group, listType))
    } else if (child.type === "list") {
      // Already in nested format — pass through
      result.push({ ...child, children: migrateChildren(child.children || []) })
      i++
    } else {
      // Non-list nodes: recurse into children
      if (child.children && Array.isArray(child.children)) {
        result.push({ ...child, children: migrateChildren(child.children) })
      } else {
        result.push(child)
      }
      i++
    }
  }

  return result
}

// Sanitize the serialized state to handle empty states and legacy nodes
export function sanitizeSerializedState(
  state: SerializedEditorState
): SerializedEditorState | null {
  // Clone to avoid mutating the original
  const cloned = JSON.parse(JSON.stringify(state))

  // Migrate legacy node types
  if (cloned.root?.children) {
    cloned.root.children = migrateChildren(cloned.root.children)
  }

  // Ensure root has at least one child (Lexical requires this)
  if (!cloned.root?.children?.length) {
    return null // Let Lexical create default state
  }

  return cloned
}

