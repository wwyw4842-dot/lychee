import { $createTableNodeWithDimensions, $findCellNode, TableCellNode, TableNode, TableRowNode } from "@lexical/table"
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  createEditor,
  KEY_TAB_COMMAND,
} from "lexical"
import { expect, test } from "vitest"
import { $handleTableTab } from "./table-tab"

function editorWithTable() {
  const editor = createEditor({
    nodes: [TableNode, TableRowNode, TableCellNode],
    onError: (error) => {
      throw error
    },
  })
  editor.registerCommand(KEY_TAB_COMMAND, (event) => $handleTableTab(event), COMMAND_PRIORITY_CRITICAL)
  editor.update(() => {
    const table = $createTableNodeWithDimensions(2, 2, false)
    $getRoot().clear().append(table)
    const row = table.getChildAtIndex(0)
    if (!(row instanceof TableRowNode)) throw new Error("missing row")
    const cell = row.getChildAtIndex(0)
    if (!(cell instanceof TableCellNode)) throw new Error("missing cell")
    const paragraph = cell.getFirstChild()
    if (!$isElementNode(paragraph)) throw new Error("missing paragraph")
    const text = $createTextNode("alpha")
    text.setFormat("highlight")
    paragraph.append(text)
    text.select(0, 5)
  })
  return editor
}

test("tab from a highlighted cell selection keeps the text and moves to the next cell", () => {
  const editor = editorWithTable()
  let prevented = false
  editor.update(() => {
    const handled = $handleTableTab({
      shiftKey: false,
      preventDefault: () => {
        prevented = true
      },
    })
    expect(handled).toBe(true)
    const table = $getRoot().getFirstChild()
    if (!(table instanceof TableNode)) throw new Error("missing table")
    const row = table.getChildAtIndex(0)
    if (!(row instanceof TableRowNode)) throw new Error("missing row")
    const first = row.getChildAtIndex(0)
    if (!(first instanceof TableCellNode)) throw new Error("missing cell")
    expect(first?.getTextContent()).toBe("alpha")
    const text = first?.getFirstDescendant()
    expect(text?.getType()).toBe("text")
    if ($isTextNode(text)) {
      expect(text.getFormat() & 128).not.toBe(0)
    }
    const selection = $getSelection()
    expect($isRangeSelection(selection)).toBe(true)
    if ($isRangeSelection(selection)) {
      expect(selection.format).toBe(0)
      const cell = $findCellNode(selection.anchor.getNode())
      expect(cell?.getIndexWithinParent()).toBe(1)
      expect(cell?.getParent()?.getIndexWithinParent()).toBe(0)
    }
  })
  expect(prevented).toBe(true)
})
