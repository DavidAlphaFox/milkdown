import type { MarkType, Node, NodeType, ResolvedPos } from '../../model'
import type { Predicate } from './types'

export interface NodeWithPos {
  pos: number
  node: Node
}
export interface NodeWithFromTo {
  from: number
  to: number
  node: Node
}

export function flatten(node: Node, descend = true): NodeWithPos[] {
  const result: NodeWithPos[] = []
  node.descendants((child, pos) => {
    result.push({ node: child, pos })
    if (!descend) return false

    return undefined
  })
  return result
}

export function findChildren(predicate: Predicate) {
  return (node: Node, descend?: boolean): NodeWithPos[] =>
    flatten(node, descend).filter((child) => predicate(child.node))
}

export function findChildrenByMark(
  node: Node,
  markType: MarkType,
  descend?: boolean
): NodeWithPos[] {
  return findChildren((child) => Boolean(markType.isInSet(child.marks)))(
    node,
    descend
  )
}
//查找对应的父亲节点
export function findParent(predicate: Predicate) {
  return ($pos: ResolvedPos): NodeWithFromTo | undefined => {
    // 深度大于0就逐层向上遍历
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const node = $pos.node(depth) //得到祖先节点

      if (predicate(node)) { //如果是自己想要的节点
        const from = $pos.before(depth) //指定深度下节点前面
        const to = $pos.after(depth) //指定深度下节点后面
        return {
          from,
          to,
          node,
        }
      }
    }

    return undefined
  }
}

export function findParentNodeType($pos: ResolvedPos, nodeType: NodeType) {
  return findParent((node) => node.type === nodeType)($pos)
}
