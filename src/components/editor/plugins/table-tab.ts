import { $getSelection, $isElementNode, $isRangeSelection, $isTextNode } from "lexical"
import {
  $findCellNode,
  $findTableNode,
  $insertTableRowAtSelection,
  $isTableCellNode,
  type TableCellNode,
} from "@lexical/table"

type TabEvent = {
  shiftKey: boolean
  preventDefault: () => void
}

function selectCellEnd(cell: TableCellNode): void {
  cell.selectEnd()
  const selection = $getSelection()
  const last = cell.getLastDescendant()
  if ($isRangeSelection(selection)) {
    selection.format = $isTextNode(last) ? last.getFormat() : 0
    selection.style = $isTextNode(last) ? last.getStyle() : ""
  }
}

function selectAdjacentCell(cell: TableCellNode, direction: "next" | "previous"): void {
  const sibling = direction === "next" ? cell.getNextSibling() : cell.getPreviousSibling()
  if ($isTableCellNode(sibling)) {
    selectCellEnd(sibling)
    return
  }
  const row = cell.getParent()
  const nextRow = direction === "next" ? row?.getNextSibling() : row?.getPreviousSibling()
  if ($isElementNode(nextRow)) {
    const child = direction === "next" ? nextRow.getFirstChild() : nextRow.getLastChild()
    if ($isTableCellNode(child)) {
      selectCellEnd(child)
      return
    }
  }
  const table = $findTableNode(cell)
  if (!table) return
  if (direction === "next") table.selectNext()
  else table.selectPrevious()
}

/** Move between table cells without replacing the current selection. */
export function $handleTableTab(event: TabEvent): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return false
  const cell = $findCellNode(selection.anchor.getNode())
  if (!$isTableCellNode(cell)) return false

  event.preventDefault()
  const direction = event.shiftKey ? "previous" : "next"
  const row = cell.getParent()
  const atLastCell =
    direction === "next" && cell.getNextSibling() === null && (row == null || row.getNextSibling() === null)
  if (atLastCell) {
    const newRow = $insertTableRowAtSelection(true)
    if (newRow) {
      const firstCell = newRow.getFirstChild()
      if ($isTableCellNode(firstCell)) selectCellEnd(firstCell)
    }
    return true
  }
  selectAdjacentCell(cell, direction)
  return true
}
