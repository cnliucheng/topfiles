<script setup lang="ts">
import { Compartment, EditorState } from '@codemirror/state'
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

/* ---- 语言加载器查表 ---- */
const LANGUAGE_LOADERS: Record<string, () => Promise<Extension>> = {
  json:       () => import('@codemirror/lang-json').then((m) => m.json()),
  html:       () => import('@codemirror/lang-html').then((m) => m.html()),
  css:        () => import('@codemirror/lang-css').then((m) => m.css()),
  php:        () => import('@codemirror/lang-php').then((m) => m.php()),
  python:     () => import('@codemirror/lang-python').then((m) => m.python()),
  javascript: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: false })),
  typescript: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true })),
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
        '.cm-scroller': {
          fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
          fontSize: 'var(--editor-font-size, 13px)',
          lineHeight: '1.55'
        },
        '.cm-content': {
          caretColor: 'var(--editor-caret)'
        },
        '.cm-cursor, .cm-dropCursor': {
          borderLeftColor: 'var(--editor-caret)'
        },
        '.cm-gutters': {
          backgroundColor: 'var(--editor-gutter-bg)',
          color: 'var(--editor-gutter-text)',
          borderRight: '1px solid var(--editor-gutter-border)'
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'var(--editor-active-gutter)'
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
  editorView?.destroy()
  editorView = null
})
</script>

<template>
  <div ref="editorRoot" class="editor-root" :style="{ '--editor-font-size': `${props.fontSize}px` }"></div>
</template>

<style scoped>
.editor-root {
  height: 100%;
}
</style>
