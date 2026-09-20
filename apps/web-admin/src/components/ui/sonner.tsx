import { Toaster as SonnerToaster, toast } from 'sonner';

/**
 * App toast host — mount once in providers (design.md §8). Top-right, 4s default;
 * errors get a manual dismiss. Uses design tokens via CSS vars.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      duration={4000}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group rounded-md border border-border bg-card text-card-foreground shadow-md text-sm',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
          error: 'border-destructive/40',
          success: 'border-success/40',
        },
      }}
      style={{ ['--width' as string]: '380px' }}
      theme="light"
    />
  );
}

export { toast };
