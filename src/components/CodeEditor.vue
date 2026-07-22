<script setup lang="ts">
import { Compartment, EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Extension } from '@codemirror/state'
import { FILE_TYPES, type FileExtension } from '../constants/fileTypes'

const props = defineProps<{
  modelValue: string
  ext: FileExtension
  fontSize: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorRoot = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
const languageCompartment = new Compartment()
let languageRequestId = 0

// 右键菜单
const contextMenu = ref({ visible: false, x: 0, y: 0, hasSelection: false })

function onContextMenu(e: MouseEvent) {
  if (!editorView) return
  const sel = editorView.state.selection.main
  const hasText = !sel.empty
  e.preventDefault()
  e.stopPropagation()
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, hasSelection: hasText }
}

function hideContextMenu() {
  contextMenu.value.visible = false
}

function menuUndo() {
  if (!editorView) return
  // CodeMirror 的 undo 通过键盘事件触发，这里手动构造
  const cmView = editorView as any
  const undo = cmView._undo
  if (undo && undo.length > 0) {
    editorView.dispatch({ annotations: undefined as any })
    // 使用原生 inputType 来触发 undo
    const event = new InputEvent('input', { inputType: 'historyUndo', bubbles: true, composed: true })
    editorView.dom.dispatchEvent(event)
  }
  hideContextMenu()
}

function menuRedo() {
  if (!editorView) return
  const event = new InputEvent('input', { inputType: 'historyRedo', bubbles: true, composed: true })
  editorView.dom.dispatchEvent(event)
  hideContextMenu()
}

function menuCut() {
  document.execCommand('cut')
  hideContextMenu()
}

function menuCopy() {
  document.execCommand('copy')
  hideContextMenu()
}

function menuPaste() {
  document.execCommand('paste')
  hideContextMenu()
}

function menuSelectAll() {
  if (!editorView) return
  const doc = editorView.state.doc
  editorView.dispatch({
    selection: EditorSelection.create([EditorSelection.range(0, doc.length)]),
    scrollIntoView: true
  })
  hideContextMenu()
}

function selectAllOccurrences() {
  if (!editorView) return
  const state = editorView.state
  const sel = state.selection.main
  const text = state.sliceDoc(sel.from, sel.to)
  if (!text) return

  const ranges: { anchor: number; head: number }[] = []
  const doc = state.doc.toString()
  const lower = doc.toLowerCase()
  const lowerText = text.toLowerCase()
  let idx = 0
  while ((idx = lower.indexOf(lowerText, idx)) !== -1) {
    ranges.push({ anchor: idx, head: idx + text.length })
    idx += text.length
  }

  if (ranges.length > 1) {
    const selRanges = ranges.map(r => EditorSelection.range(r.anchor, r.head))
    editorView.dispatch({
      selection: EditorSelection.create(selRanges),
      scrollIntoView: true
    })
  }
  hideContextMenu()
}

/* ---- 语言加载器查表 ---- */
const LANGUAGE_LOADERS: Record<string, () => Promise<Extension>> = {
  json:       () => import('@codemirror/lang-json').then((m) => m.json()),
  html:       () => import('@codemirror/lang-html').then((m) => m.html()),
  css:        () => import('@codemirror/lang-css').then((m) => m.css()),
  php:        () => import('@codemirror/lang-php').then((m) => m.php()),
  python:     () => import('@codemirror/lang-python').then((m) => m.python()),
  javascript: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: false })),
  typescript: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true })),
  jsx:        () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true })),
  tsx:        () => import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true, jsx: true })),
  shell:      () => import('@codemirror/legacy-modes/mode/shell').then(({ shell }) =>
    import('@codemirror/language').then(({ StreamLanguage }) => StreamLanguage.define(shell))
  ),
}

async function loadLanguageExtension(ext: FileExtension): Promise<Extension> {
  const option = FILE_TYPES.find((f) => f.ext === ext)
  const lang = option?.language
  if (!lang || !LANGUAGE_LOADERS[lang]) return []
  return LANGUAGE_LOADERS[lang]()
}

async function applyLanguage(ext: FileExtension): Promise<void> {
  if (!editorView) return
  const requestId = ++languageRequestId
  const extension = await loadLanguageExtension(ext)

  if (!editorView || requestId !== languageRequestId) return

  editorView.dispatch({
    effects: languageCompartment.reconfigure(extension)
  })
}

onMounted(() => {
  if (!editorRoot.value) return

  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      basicSetup,
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          height: '100%',
          backgroundColor: 'var(--editor-bg)',
          color: 'var(--editor-text)'
        },
        '.cm-selectionBackground': {
          backgroundColor: 'var(--editor-selection) !important'
        },
        '&.cm-focused .cm-selectionBackground': {
          backgroundColor: 'var(--editor-selection-focus) !important'
        },
        '.cm-scroller': {
          fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
          fontSize: 'var(--editor-font-size, 13px)',
          lineHeight: '1.6'
        },
        '.cm-content': {
          caretColor: 'var(--editor-caret)',
          padding: '10px 0'
        },
        '.cm-cursor, .cm-dropCursor': {
          borderLeftColor: 'var(--editor-caret)',
          borderLeftWidth: '2px'
        },
        '.cm-gutters': {
          backgroundColor: 'var(--editor-gutter-bg)',
          color: 'var(--editor-gutter-text)',
          borderRight: '1px solid var(--editor-gutter-border)'
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'var(--editor-active-gutter)'
        },
        '.cm-activeLine': {
          backgroundColor: 'var(--editor-active-line)'
        }
      }),
      languageCompartment.of([]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          emit('update:modelValue', update.state.doc.toString())
        }
      })
    ]
  })

  editorView = new EditorView({
    state,
    parent: editorRoot.value
  })

  // 绑定右键菜单
  editorView.dom.addEventListener('contextmenu', onContextMenu)
  document.addEventListener('click', hideContextMenu)

  void applyLanguage(props.ext)
})

watch(
  () => props.modelValue,
  (nextValue) => {
    if (!editorView) return
    const currentValue = editorView.state.doc.toString()
    if (nextValue === currentValue) return

    editorView.dispatch({
      changes: { from: 0, to: currentValue.length, insert: nextValue }
    })
  }
)

watch(
  () => props.ext,
  (nextExt) => {
    void applyLanguage(nextExt)
  }
)

onBeforeUnmount(() => {
  document.removeEventListener('click', hideContextMenu)
  editorView?.dom.removeEventListener('contextmenu', onContextMenu)
  editorView?.destroy()
  editorView = null
})
</script>

<template>
  <div class="editor-wrapper">
    <div ref="editorRoot" class="editor-root" :style="{ '--editor-font-size': `${props.fontSize}px` }"></div>
    <!-- 右键菜单 -->
    <div
      v-if="contextMenu.visible"
      class="cm-context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <button @click="menuUndo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
          <polyline points="1,4 1,10 7,10" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3.51 15a9 9 0 102.13-9.36L1 10" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>撤销</span>
        <span class="shortcut">⌘Z</span>
      </button>
      <button @click="menuRedo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
          <polyline points="23,4 23,10 17,10" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>重做</span>
        <span class="shortcut">⌘⇧Z</span>
      </button>
      <div class="cm-menu-sep"></div>
      <button @click="menuCut">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
          <circle cx="6" cy="6" r="3"/>
          <circle cx="6" cy="18" r="3"/>
          <line x1="8.6" y1="8.6" x2="15.4" y2="15.4" stroke-linecap="round"/>
          <line x1="15.4" y1="8.6" x2="8.6" y2="15.4" stroke-linecap="round"/>
        </svg>
        <span>剪切</span>
        <span class="shortcut">⌘X</span>
      </button>
      <button @click="menuCopy">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
        <span>复制</span>
        <span class="shortcut">⌘C</span>
      </button>
      <button @click="menuPaste">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
          <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
        </svg>
        <span>粘贴</span>
        <span class="shortcut">⌘V</span>
      </button>
      <div class="cm-menu-sep"></div>
      <button @click="menuSelectAll">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
        </svg>
        <span>全选</span>
        <span class="shortcut">⌘A</span>
      </button>
      <div v-if="contextMenu.hasSelection" class="cm-menu-sep"></div>
      <button v-if="contextMenu.hasSelection" @click="selectAllOccurrences">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65" stroke-linecap="round"/>
        </svg>
        <span>批量选中相同词</span>
        <span class="shortcut">⌘⇧L</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.editor-wrapper {
  position: relative;
  height: 100%;
}
.editor-root {
  height: 100%;
}
.cm-context-menu {
  position: fixed;
  z-index: 5000;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
  padding: 6px;
  min-width: 240px;
}
.cm-context-menu button {
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text-main);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.cm-context-menu button:hover {
  background: var(--primary-soft);
  color: var(--primary-text);
}
.cm-context-menu .shortcut {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-sub);
  font-family: monospace;
}
.cm-context-menu button:hover .shortcut {
  color: var(--primary-text);
}
.cm-menu-sep {
  height: 1px;
  background: var(--border);
  margin: 4px 8px;
}
</style>
