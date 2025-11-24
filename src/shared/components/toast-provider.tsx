import React, { createContext, useCallback, useContext, useState } from 'react'
import * as RadixToast from '@radix-ui/react-toast'

type ToastVariant = 'info' | 'success' | 'error'

type Toast = {
  id: string
  title: string | undefined
  description: string | undefined
  duration: number
  variant: ToastVariant
}

type ShowToastOptions = {
  title?: string
  description?: string
  duration?: number
  variant?: ToastVariant
}

type ToastContextValue = {
  showToast: (opts: ShowToastOptions) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export const ToastProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((opts: ShowToastOptions) => {
    type CryptoWithRandomUUID = typeof crypto & { randomUUID?: () => string }
    const uuid = typeof crypto !== 'undefined' && (crypto as CryptoWithRandomUUID).randomUUID
      ? (crypto as CryptoWithRandomUUID).randomUUID!()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

    const toast: Toast = {
      id: uuid,
      title: opts.title === undefined ? undefined : String(opts.title),
      description: opts.description === undefined ? undefined : String(opts.description),
      duration: opts.duration ?? 5000,
      variant: opts.variant ?? 'info',
    }
    setToasts((s) => [...s, toast])
    return uuid
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((s) => s.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      <RadixToast.Provider swipeDirection="right">
        {children}

        {toasts.map((t) => (
          <RadixToast.Root
            key={t.id}
            open
            onOpenChange={(open) => {
              if (!open) dismiss(t.id)
            }}
            className={`max-w-sm w-full rounded-lg shadow-lg p-3 mb-2 flex items-start gap-3 bg-white dark:bg-gray-800 border ${
              t.variant === 'success'
                ? 'border-green-200'
                : t.variant === 'error'
                ? 'border-red-200'
                : 'border-gray-200'
            }`}
            duration={t.duration}
          >
            <div className="flex-1">
              {t.title ? (
                <RadixToast.Title className="font-medium text-sm text-gray-900 dark:text-gray-100">{t.title}</RadixToast.Title>
              ) : null}
              {t.description ? (
                <RadixToast.Description className="text-sm text-gray-700 dark:text-gray-300">{t.description}</RadixToast.Description>
              ) : null}
            </div>
            <RadixToast.Close className="text-gray-500 hover:text-gray-700" aria-label="Close">×</RadixToast.Close>
          </RadixToast.Root>
        ))}

        <RadixToast.Viewport className="fixed bottom-4 right-4 z-50 flex flex-col items-end p-2 gap-2 w-auto max-w-full" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  )
}

export default ToastProvider
