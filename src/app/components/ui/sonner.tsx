import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        style: {
          background: '#ffffff',
          border: '1px solid #d6d6d6',
          color: '#000000',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
