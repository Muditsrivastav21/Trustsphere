import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast font-sans !bg-[var(--color-surface)] !text-[var(--color-text-main)] !border-[var(--color-border-default)] !rounded-md !shadow-[0_4px_16px_rgba(0,0,0,0.08)] !text-[13px]",
          title: "font-medium",
          description: "!text-[var(--color-text-sub)] !text-[12.5px]",
          actionButton: "!bg-[var(--color-accent-brand)] !text-white !rounded-md",
          cancelButton: "!bg-[var(--color-surface-sunken)] !text-[var(--color-text-sub)] !rounded-md",
          error: "!border-[var(--color-danger-border)]",
          success: "!border-[var(--color-success-border)]",
          warning: "!border-[var(--color-warning-border)]",
          icon: "opacity-90",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
