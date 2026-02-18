import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import AlertDialog from '../components/AlertDialog';
import ConfirmDialog from '../components/ConfirmDialog';

interface AlertState {
  message: string;
  title?: string;
}

interface ConfirmState {
  message: string;
  title?: string;
  resolve: (value: boolean) => void;
}

interface AlertContextValue {
  showAlert: (message: string, title?: string) => void;
  showConfirm: (message: string, title?: string) => Promise<boolean>;
}

const AlertContext = createContext<AlertContextValue | undefined>(undefined);

export function useAlert(): AlertContextValue {
  const context = useContext(AlertContext);
  if (context === undefined) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
}

interface AlertProviderProps {
  children: ReactNode;
}

export function AlertProvider({ children }: AlertProviderProps) {
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const showAlert = useCallback((message: string, title?: string) => {
    setAlert({ message, title });
  }, []);

  const closeAlert = useCallback(() => {
    setAlert(null);
  }, []);

  const showConfirm = useCallback((message: string, title?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirm({ message, title, resolve });
    });
  }, []);

  const handleConfirmChoice = useCallback((confirmed: boolean) => {
    setConfirm((prev) => {
      if (prev) {
        prev.resolve(confirmed);
        return null;
      }
      return prev;
    });
  }, []);

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {alert && (
        <AlertDialog
          message={alert.message}
          title={alert.title}
          onClose={closeAlert}
        />
      )}
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          title={confirm.title}
          onConfirm={() => handleConfirmChoice(true)}
          onCancel={() => handleConfirmChoice(false)}
        />
      )}
    </AlertContext.Provider>
  );
}
