import type { Node } from '@milkdown/prose/model'
import type { EditorView } from '@milkdown/prose/view'
import { findParent } from '@milkdown/prose'
import type { Ref } from 'atomico'
import { editorViewCtx } from '@milkdown/core'
import { CellSelection } from '@milkdown/prose/tables'
import { findTable } from '@milkdown/preset-gfm'
import { computePosition } from '@floating-ui/dom'
import type { Ctx } from '@milkdown/ctx'
import type { CellIndex, Refs } from './types'

export function findNodeIndex(parent: Node, child: Node) {
  for (let i = 0; i < parent.childCount; i++) {
    if (parent.child(i) === child)
      return i
  }
  return -1
}

export function findPointerIndex(event: PointerEvent, view?: EditorView): CellIndex | undefined {
  if (!view)
    return
  const posAtCoords = view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!posAtCoords)
    return
  const pos = posAtCoords?.inside
  if (pos == null || pos < 0)
    return

  const $pos = view.state.doc.resolve(pos)
  const node = view.state.doc.nodeAt(pos)
  if (!node)
    return

  const cellType = ['table_cell', 'table_header']
  const rowType = ['table_row', 'table_header_row']

  const cell = cellType.includes(node.type.name) ? node : findParent(node => cellType.includes(node.type.name))($pos)?.node
  const row = findParent(node => rowType.includes(node.type.name))($pos)?.node
  const table = findParent(node => node.type.name === 'table')($pos)?.node
  if (!cell || !row || !table)
    return

  const columnIndex = findNodeIndex(row, cell)
  const rowIndex = findNodeIndex(table, row)

  return [rowIndex, columnIndex]
}

export function getRelatedDOM(contentWrapperRef: Ref<HTMLDivElement>, [rowIndex, columnIndex]: CellIndex) {
  const content = contentWrapperRef.current
  if (!content)
    return
  const rows = content.querySelectorAll('tr')
  const row = rows[rowIndex]
  if (!row)
    return

  const firstRow = rows[0]
  if (!firstRow)
    return

  const headerCol = firstRow.children[columnIndex]
  if (!headerCol)
    return

  const col = row.children[columnIndex]
  if (!col)
    return

  return {
    row,
    col,
    headerCol,
  }
}

export function recoveryStateBetweenUpdate(
  refs: Refs,
  ctx?: Ctx,
  node?: Node,
) {
  if (!ctx)
    return
  if (!node)
    return
  const { selection } = ctx.get(editorViewCtx).state
  if (!(selection instanceof CellSelection))
    return

  const { $from } = selection
  const table = findTable($from)
  if (!table || table.node !== node)
    return

  const {
    hoverIndex,
    colHandleRef,
    rowHandleRef,
    contentWrapperRef,
  } = refs

  if (selection.isColSelection()) {
    const { $head } = selection
    const colIndex = $head.index($head.depth - 1)
    const index: CellIndex = [0, colIndex]
    hoverIndex.current = index
    const colHandle = colHandleRef.current
    if (!colHandle)
      return
    const dom = getRelatedDOM(contentWrapperRef, index)
    if (!dom)
      return
    const { headerCol: col } = dom
    colHandle.dataset.show = 'true'

    colHandle.querySelector('.button-group')?.setAttribute('data-show', 'true')

    computePosition(col, colHandle, { placement: 'top' }).then(({ x, y }) => {
      Object.assign(colHandle.style, {
        left: `${x}px`,
        top: `${y}px`,
      })
    })
    return
  }
  if (selection.isRowSelection()) {
    const { $head } = selection
    const rowNode = findParent(node => node.type.name === 'table_row' || node.type.name === 'table_header_row')($head)
    if (!rowNode)
      return
    const rowIndex = findNodeIndex(table.node, rowNode.node)
    const index: CellIndex = [rowIndex, 0]
    hoverIndex.current = index
    const rowHandle = rowHandleRef.current
    if (!rowHandle)
      return
    const dom = getRelatedDOM(contentWrapperRef, index)
    if (!dom)
      return
    const { row } = dom
    rowHandle.dataset.show = 'true'

    if (rowIndex > 0)
      rowHandle.querySelector('.button-group')?.setAttribute('data-show', 'true')

    computePosition(row, rowHandle, { placement: 'left' }).then(({ x, y }) => {
      Object.assign(rowHandle.style, {
        left: `${x}px`,
        top: `${y}px`,
      })
    })
  }
}
