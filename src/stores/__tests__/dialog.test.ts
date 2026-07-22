import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDialogStore } from '../dialog'

describe('dialog store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts hidden', () => {
    const dialog = useDialogStore()
    expect(dialog.state.visible).toBe(false)
    expect(dialog.state.type).toBe('alert')
  })

  it('alert shows message and resolves on close', async () => {
    const dialog = useDialogStore()
    const promise = dialog.alert('Hello', 'Title')
    expect(dialog.state.visible).toBe(true)
    expect(dialog.state.message).toBe('Hello')
    expect(dialog.state.title).toBe('Title')
    expect(dialog.state.type).toBe('alert')

    dialog.close()
    await expect(promise).resolves.toBeUndefined()
    expect(dialog.state.visible).toBe(false)
  })

  it('confirm resolves true when closed with true', async () => {
    const dialog = useDialogStore()
    const promise = dialog.confirm('Are you sure?')
    expect(dialog.state.type).toBe('confirm')

    dialog.close(true)
    await expect(promise).resolves.toBe(true)
  })

  it('confirm resolves false when closed with null', async () => {
    const dialog = useDialogStore()
    const promise = dialog.confirm('Are you sure?')

    dialog.close(null)
    await expect(promise).resolves.toBe(false)
  })

  it('prompt resolves with string value', async () => {
    const dialog = useDialogStore()
    const promise = dialog.prompt('Enter name', 'default')

    expect(dialog.state.defaultValue).toBe('default')
    dialog.close('typed value')
    await expect(promise).resolves.toBe('typed value')
  })

  it('prompt resolves null when cancelled', async () => {
    const dialog = useDialogStore()
    const promise = dialog.prompt('Enter name')

    dialog.close(null)
    await expect(promise).resolves.toBeNull()
  })
})
