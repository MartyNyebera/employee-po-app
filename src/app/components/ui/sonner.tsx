import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        style: {
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          color: '#111827',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
