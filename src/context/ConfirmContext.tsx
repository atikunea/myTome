import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

type ConfirmRequest = { text: string; action: () => Promise<void> };
type ConfirmFn = (text: string, action: () => Promise<void>) => void;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const confirmAction = useCallback<ConfirmFn>((text, action) => {
    setError("");
    setRequest({ text, action });
  }, []);

  const handleCancel = () => {
    setRequest(null);
    setError("");
  };

  const handleConfirm = async () => {
    if (!request) return;
    setPending(true);
    try {
      await request.action();
      setRequest(null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete action.");
    } finally {
      setPending(false);
    }
  };

  return (
    <ConfirmContext.Provider value={confirmAction}>
      {children}
      <Dialog
        open={request !== null}
        onClose={handleCancel}
        aria-label="Confirm deletion"
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Are you sure?</DialogTitle>
        <DialogContent>
          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}
          <DialogContentText>{request?.text}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancel}>Cancel</Button>
          <Button color="error" variant="contained" loading={pending} onClick={handleConfirm}>
            Delete permanently
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
