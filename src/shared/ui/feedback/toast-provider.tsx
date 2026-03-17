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

const toastVariantClassNames: Record<ToastVariant, string> = {
  info: 'border-accent-primary/28 bg-bg-secondary/96',
  success: 'border-success/32 bg-success/12',
  error: 'border-error/32 bg-error/12',
}

const toastAccentClassNames: Record<ToastVariant, string> = {
  info: 'bg-accent-primary',
  success: 'bg-success',
  error: 'bg-error',
}

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export const ToastProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((opts: ShowToastOptions) => {
    const uuid = crypto.randomUUID()

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
            className={`mb-2 flex w-full max-w-sm items-start gap-3 rounded-2xl border p-3.5 text-text-primary shadow-[0_18px_44px_rgba(2,8,18,0.28)] backdrop-blur-xl ${toastVariantClassNames[t.variant]}`}
            duration={t.duration}
          >
            <span
              className={`mt-0.5 h-2.5 w-2.5 flex-none rounded-full ${toastAccentClassNames[t.variant]}`}
              aria-hidden
            />
            <div className="flex-1">
              {t.title ? (
                <RadixToast.Title className="text-sm font-semibold text-text-primary">{t.title}</RadixToast.Title>
              ) : null}
              {t.description ? (
                <RadixToast.Description className="mt-1 text-sm text-text-secondary">{t.description}</RadixToast.Description>
              ) : null}
            </div>
            <RadixToast.Close
              className="flex-none rounded-md px-1 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              aria-label="Close"
            >
              ×
            </RadixToast.Close>
          </RadixToast.Root>
        ))}

        <RadixToast.Viewport className="fixed bottom-4 right-4 z-50 flex flex-col items-end p-2 gap-2 w-auto max-w-full" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  )
}

export default ToastProvider
