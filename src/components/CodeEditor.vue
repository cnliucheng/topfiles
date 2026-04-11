<script setup lang="ts">
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Extension } from '@codemirror/state'
import type { FileExtension } from '../constants/fileTypes'

const props = defineProps<{
  modelValue: string
  ext: FileExtension
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorRoot = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
const languageCompartment = new Compartment()
let languageRequestId = 0

async function loadLanguageExtension(ext: FileExtension): Promise<Extension> {
  switch (ext) {
    case 'json': {
      const mod = await import('@codemirror/lang-json')
      return mod.json()
    }
    case 'html': {
      const mod = await import('@codemirror/lang-html')
      return mod.html()
    }
    case 'css': {
      const mod = await import('@codemirror/lang-css')
      return mod.css()
    }
    case 'php': {
      const mod = await import('@codemirror/lang-php')
      return mod.php()
    }
    case 'py': {
      const mod = await import('@codemirror/lang-python')
      return mod.python()
    }
    case 'js': {
      const mod = await import('@codemirror/lang-javascript')
      return mod.javascript({ typescript: false })
    }
    case 'ts': {
      const mod = await import('@codemirror/lang-javascript')
      return mod.javascript({ typescript: true })
    }
    default:
      return []
  }
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
        '.cm-scroller': { fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace' },
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
  <div ref="editorRoot" class="editor-root"></div>
</template>

<style scoped>
.editor-root {
  height: 100%;
}
</style>
