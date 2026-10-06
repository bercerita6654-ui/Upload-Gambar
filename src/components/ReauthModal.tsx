import React, { useState } from 'react';
import { LogIn, AlertCircle, ShieldAlert, CheckCircle2, Loader2, X } from 'lucide-react';
import { googleSignIn, clearAuthToken } from '../services/auth';

interface ReauthModalProps {
  isOpen: boolean;
  userEmail?: string | null;
  reason?: string;
  onSuccess: (newToken: string) => void;
  onClose: () => void;
}

export const ReauthModal: React.FC<ReauthModalProps> = ({
  isOpen,
  userEmail,
  reason,
  onSuccess,
  onClose,
}) => {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    setErrorMsg(null);
    clearAuthToken();

    try {
      // Direct click handler provides 100% genuine user gesture for popup
      const result = await googleSignIn();
      if (result && result.accessToken) {
        setIsLoggingIn(false);
        onSuccess(result.accessToken);
        onClose();
      } else {
        throw new Error('Tidak menerima token akses dari Google.');
      }
    } catch (err: unknown) {
      setIsLoggingIn(false);
      const errObj = err as { message?: string; code?: string };
      console.warn('Reauth sign in failed:', err);
      if (errObj.code === 'auth/popup-blocked') {
        setErrorMsg('Popup Google Auth terblokir oleh browser. Harap izinkan pop-up untuk situs ini.');
      } else if (errObj.code === 'auth/popup-closed-by-user') {
        setErrorMsg('Jendela login ditutup sebelum selesai. Silakan klik tombol untuk mencoba lagi.');
      } else {
        setErrorMsg(errObj.message || 'Gagal masuk dengan akun Google. Silakan coba kembali.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-amber-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with warning accent */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-xs">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Sesi Google Perlu Diperbarui</h3>
              <p className="text-xs text-amber-100">Kredensial OAuth kedaluwarsa / invalid</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-950">
                Otorisasi Google Drive Diperlukan
              </p>
              <p className="text-amber-800 leading-relaxed">
                {reason ||
                  'Sesi login Google Anda telah kedaluwarsa atau token tidak valid. Silakan klik tombol di bawah untuk masuk kembali secara otomatis dan melanjutkan proses unggah/replace file.'}
              </p>
            </div>
          </div>

          {userEmail && (
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
              <span className="text-slate-500">Akun terdaftar:</span>
              <span className="font-mono font-semibold text-slate-900">{userEmail}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoggingIn}
              className="w-full sm:w-auto flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isLoggingIn}
              className="w-full sm:w-auto flex-2 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyambungkan ke Google...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Login Google &amp; Lanjutkan Otomatis</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
