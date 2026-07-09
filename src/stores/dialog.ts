import { defineStore } from 'pinia'
import { ref } from 'vue'

export type DialogType = 'alert' | 'confirm' | 'prompt'

interface DialogState {
  visible: boolean
  type: DialogType
  title: string
  message: string
  defaultValue: string
  resolve: ((value: boolean | string | null) => void) | null
}

export const useDialogStore = defineStore('dialog', () => {
  const state = ref<DialogState>({
    visible: false,
    type: 'alert',
    title: '',
    message: '',
    defaultValue: '',
    resolve: null,
  })

  function alert(message: string, title = '提示'): Promise<void> {
    return new Promise((resolve) => {
      state.value = {
        visible: true,
        type: 'alert',
        title,
        message,
        defaultValue: '',
        resolve: () => resolve(),
      }
    })
  }

  function confirm(message: string, title = '确认'): Promise<boolean> {
    return new Promise((resolve) => {
      state.value = {
        visible: true,
        type: 'confirm',
        title,
        message,
        defaultValue: '',
        resolve: (value) => resolve(value === true),
      }
    })
  }

  function prompt(message: string, defaultValue = '', title = '输入'): Promise<string | null> {
    return new Promise((resolve) => {
      state.value = {
        visible: true,
        type: 'prompt',
        title,
        message,
        defaultValue,
        resolve: (value) => resolve(value as string | null),
      }
    })
  }

  function close(value: boolean | string | null = null) {
    state.value.resolve?.(value)
    state.value.visible = false
  }

  return { state, alert, confirm, prompt, close }
})
