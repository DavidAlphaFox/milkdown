import type { Ctx } from '@milkdown/ctx'
import type { Selection } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'

import { editorViewCtx } from '@milkdown/core'
import { browser } from '@milkdown/prose'
import { NodeSelection } from '@milkdown/prose/state'
import throttle from 'lodash.throttle'

import type { FilterNodes } from './block-config'
import type { ActiveNode } from './types'

import { selectRootNodeByDom } from './__internal__/select-node-by-dom'
import { serializeForClipboard } from './__internal__/serialize-for-clipboard'
import { blockConfig } from './block-config'

const brokenClipboardAPI =
  (browser.ie && <number>browser.ie_version < 15) ||
  (browser.ios && browser.webkit_version < 604)

const buffer = 20

/// @internal
export type BlockServiceMessageType =
  | {
      type: 'hide'
    }
  | {
      type: 'show'
      active: ActiveNode
    }

/// @internal
export type BlockServiceMessage = (message: BlockServiceMessageType) => void

/// @internal
/// The block service, provide events and methods for block plugin.
/// Generally you don't need to use this class directly.
export class BlockService {
  /// @internal
  #ctx?: Ctx
  //鼠标点击后，创建选中区域
  /// @internal
  #createSelection: () => null | Selection = () => {
    if (!this.#active) return null
    const result = this.#active
    const view = this.#view

    if (view && NodeSelection.isSelectable(result.node)) {
      const nodeSelection = NodeSelection.create(
        view.state.doc,
        result.$pos.pos
      ) //创建选中区域
      view.dispatch(view.state.tr.setSelection(nodeSelection)) //对视图的状态进行事务转换
      view.focus()
      this.#activeSelection = nodeSelection
      return nodeSelection
    }
    return null
  }

  /// @internal
  #activeSelection: null | Selection = null
  /// @internal
  #active: null | ActiveNode = null
  /// @internal
  #activeDOMRect: undefined | DOMRect = undefined

  /// @internal
  #dragging = false
  // 从config中找到对应的配置，是否有节点过滤器
  /// @internal
  get #filterNodes(): FilterNodes | undefined {
    return this.#ctx?.get(blockConfig.key).filterNodes
  }

  /// @internal
  get #view() {
    return this.#ctx?.get(editorViewCtx)
  }

  /// @internal
  #notify?: BlockServiceMessage

  /// @internal
  #hide = () => {
    this.#notify?.({ type: 'hide' })
    this.#active = null
  }

  /// @internal
  #show = (active: ActiveNode) => {
    this.#active = active
    this.#notify?.({ type: 'show', active })
  }

  /// Bind editor context and notify function to the service.
  bind = (ctx: Ctx, notify: BlockServiceMessage) => {
    this.#ctx = ctx
    this.#notify = notify
  }

  /// Add mouse event to the dom.
  addEvent = (dom: HTMLElement) => {
    dom.addEventListener('mousedown', this.#handleMouseDown)
    dom.addEventListener('mouseup', this.#handleMouseUp)
    dom.addEventListener('dragstart', this.#handleDragStart)
  }

  /// Remove mouse event to the dom.
  removeEvent = (dom: HTMLElement) => {
    dom.removeEventListener('mousedown', this.#handleMouseDown)
    dom.removeEventListener('mouseup', this.#handleMouseUp)
    dom.removeEventListener('dragstart', this.#handleDragStart)
  }

  /// Unbind the notify function.
  unBind = () => {
    this.#notify = undefined
  }

  /// @internal
  #handleMouseDown = () => {
    this.#activeDOMRect = this.#active?.el.getBoundingClientRect()
    this.#createSelection()
  }
  // 对区块的拖拽开始
  /// @internal
  #handleMouseUp = () => {
    if (!this.#dragging) {
      requestAnimationFrame(() => {
        if (!this.#activeDOMRect) return
        this.#view?.focus()
      }) //如果不是dragging的状态，需要让视图被选中

      return
    }
    this.#dragging = false
    this.#activeSelection = null
  }

  /// @internal
  #handleDragStart = (event: DragEvent) => {
    this.#dragging = true //设置拖拽的状态

    const view = this.#view //当前视图
    if (!view) return
    view.dom.dataset.dragging = 'true' //设置视图处在拖拽状态

    const selection = this.#activeSelection
    if (event.dataTransfer && selection) {
      const slice = selection.content() //获取当前内容
      event.dataTransfer.effectAllowed = 'copyMove' //设置拖拽事件准许操作
      const { dom, text } = serializeForClipboard(view, slice)//将拖拽内容序列化到剪切板中
      event.dataTransfer.clearData() // 清空数据
      event.dataTransfer.setData(
        brokenClipboardAPI ? 'Text' : 'text/html',
        dom.innerHTML
      ) // 设置数据类型和数据
      if (!brokenClipboardAPI) event.dataTransfer.setData('text/plain', text)
      const activeEl = this.#active?.el
      if (activeEl) event.dataTransfer.setDragImage(activeEl, 0, 0) //创建拖拽的镜像

      view.dragging = {
        slice,
        move: true,
      } //通知编辑器视图，正在拖拽
    }
  }

  /// @internal
  keydownCallback = (view: EditorView) => {
    this.#hide()

    this.#dragging = false
    view.dom.dataset.dragging = 'false'
    return false
  }
  //当鼠标放到一个block上的时候
  /// @internal
  #mousemoveCallback = throttle((view: EditorView, event: MouseEvent) => {
    if (!view.editable) return //不在编辑状体立刻结束

    const rect = view.dom.getBoundingClientRect() //得到该区域的大小
    const x = rect.left + rect.width / 2 // 计算x轴的中间位置
    // 得到特定位置的DOM对象
    const dom = view.root.elementFromPoint(x, event.clientY)
    if (!(dom instanceof Element)) {//不是DOM对象
      this.#hide() //隐藏
      return
    }

    const filterNodes = this.#filterNodes
    if (!filterNodes) return
    // 找到该位置上符合条件的DOM节点
    const result = selectRootNodeByDom(
      view,
      { x, y: event.clientY },
      filterNodes
    )

    if (!result) {
      this.#hide()
      return
    }
    this.#show(result)
  }, 200)

  /// @internal
  mousemoveCallback = (view: EditorView, event: MouseEvent) => {
    if (view.composing || !view.editable) return false

    this.#mousemoveCallback(view, event)

    return false
  }

  /// @internal
  dragoverCallback = (view: EditorView, event: DragEvent) => {
    if (this.#dragging) {
      const root = this.#view?.dom.parentElement
      if (!root) return false

      const hasHorizontalScrollbar = root.scrollHeight > root.clientHeight

      const rootRect = root.getBoundingClientRect()
      if (hasHorizontalScrollbar) {
        if (root.scrollTop > 0 && Math.abs(event.y - rootRect.y) < buffer) {
          const top = root.scrollTop > 10 ? root.scrollTop - 10 : 0
          root.scrollTop = top
          return false
        }
        const totalHeight = Math.round(view.dom.getBoundingClientRect().height)
        const scrollBottom = Math.round(root.scrollTop + rootRect.height)
        if (
          scrollBottom < totalHeight &&
          Math.abs(event.y - (rootRect.height + rootRect.y)) < buffer
        ) {
          const top = root.scrollTop + 10
          root.scrollTop = top
          return false
        }
      }
    }
    return false
  }

  /// @internal
  dragenterCallback = (view: EditorView) => {
    if (!view.dragging) return

    this.#dragging = true
    view.dom.dataset.dragging = 'true'
  }

  /// @internal
  dragleaveCallback = (view: EditorView, event: DragEvent) => {
    const x = event.clientX
    const y = event.clientY
    // if cursor out of the editor
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
      this.#active = null
      this.#dragEnd(view)
    }
  }

  /// @internal
  dropCallback = (view: EditorView) => {
    this.#dragEnd(view)

    return false
  }

  /// @internal
  dragendCallback = (view: EditorView) => {
    this.#dragEnd(view)
  }

  /// @internal
  #dragEnd = (view: EditorView) => {
    this.#dragging = false
    view.dom.dataset.dragging = 'false'
  }
}
