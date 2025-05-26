import type { EditorView } from '@milkdown/prose/view'

import type { FilterNodes } from '../block-config'
import type { ActiveNode } from '../types'
// 寻找对应DOM的根节点
export function selectRootNodeByDom(
  view: EditorView,
  coords: { x: number; y: number },
  filterNodes: FilterNodes
): ActiveNode | null {
  const root = view.dom.parentElement //返回EditorView的根DOM
  if (!root) return null

  try {
    const pos = view.posAtCoords({
      left: coords.x,
      top: coords.y,
    })?.inside //返回对应坐标系啊的内容位置
    if (pos == null || pos < 0) return null
    //ResolvedPos是状态模型对特定位置进行决策后获得更多信息
    let $pos = view.state.doc.resolve(pos) //返回所在位置下的文档对象
    let node = view.state.doc.nodeAt(pos)//返回所在位置下的Node实例
    let element = view.nodeDOM(pos) as HTMLElement | null //该位置下的HTMLElement

    const filter = (needLookup: boolean) => {
      const checkDepth = $pos.depth >= 1 && $pos.index($pos.depth) === 0
      const shouldLookUp = needLookup || checkDepth //检车是否需要进行root查找

      if (!shouldLookUp) return

      const ancestorPos = $pos.before($pos.depth)
      node = view.state.doc.nodeAt(ancestorPos)
      element = view.nodeDOM(ancestorPos) as HTMLElement | null
      $pos = view.state.doc.resolve(ancestorPos)
      //如果还没法找到，那就在进行上层的检查
      if (!filterNodes($pos, node!)) filter(true)
    }

    // If filterNodes returns false, we should look up the parent node.
    const filterResult = filterNodes($pos, node!) //使用用户设定的过滤器寻找root
    filter(!filterResult)//当用户设定的过滤器没有起作用，使用预先设定的过滤器找root

    if (!element || !node) return null

    return { node, $pos, el: element }
  } catch {
    return null
  }
}
