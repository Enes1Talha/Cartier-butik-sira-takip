import { useEffect, useState } from "react";
import { watchAuth, loginWithGoogle, logout, checkRedirectResult } from "./firebase";
import { ALLOWED_EMAILS } from "./allowedUsers";

const S = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#191713",
    color: "#F2EDE4",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    padding: 24,
  },
  card: {
    background: "#221F1A",
    border: "1px solid #332E26",
    borderRadius: 14,
    padding: 32,
    maxWidth: 380,
    width: "100%",
    textAlign: "center",
  },
  title: {
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: 24,
    marginBottom: 10,
  },
  help: { fontSize: 13, color: "#9A9186", lineHeight: 1.6, marginBottom: 22 },
  btn: {
    width: "100%",
    background: "#F2EDE4",
    color: "#191713",
    border: "none",
    borderRadius: 8,
    padding: "13px 16px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  denied: {
    fontSize: 13,
    color: "#D2544B",
    lineHeight: 1.6,
    marginBottom: 18,
  },
  ghost: {
    background: "transparent",
    border: "1px solid #332E26",
    color: "#9A9186",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    cursor: "pointer",
  },
  loading: { fontSize: 13, color: "#6B6359" },
  err: { fontSize: 12, color: "#D2544B", marginTop: 14, lineHeight: 1.5 },
};

export default function AuthGate({ children }) {
  const [user, setUser] = useState(undefined);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsub = watchAuth((u) => setUser(u));
    checkRedirectResult().catch((err) => {
      setAuthError(err?.message || "Giriş sırasında bir hata oluştu.");
    });
    return () => unsub();
  }, []);

  if (user === undefined) {
    return (
      <div style={S.page}>
        <p style={S.loading}>Yükleniyor…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <h1 style={S.title}>Butik Sıra Takip</h1>
          <p style={S.help}>
            Bu sayfa sadece yetkili ekip için. Devam etmek için Google
            hesabınla giriş yap.
          </p>
          <button style={S.btn} onClick={loginWithGoogle}>
            Google ile Giriş Yap
          </button>
          {authError && <p style={S.err}>{authError}</p>}
        </div>
      </div>
    );
  }

  const allowed = ALLOWED_EMAILS.includes((user.email || "").toLowerCase());

  if (!allowed) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <h1 style={S.title}>Erişim yok</h1>
          <p style={S.denied}>
            {user.email} ile giriş yaptın ama bu hesabın listeye erişim izni
            yok. Erişim istiyorsan yöneticine ulaş.
          </p>
          <button style={S.ghost} onClick={logout}>
            Çıkış yap
          </button>
        </div>
      </div>
    );
  }

  return children(user);
}