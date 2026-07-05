"use client";

import { useEffect, useState, useRef } from "react";

export default function GuestComplete() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [doc, setDoc] = useState("");
  const [plate, setPlate] = useState("");
  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [success, setSuccess] = useState(false);

  // Câmera
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const tk = searchParams.get("token");
    if (!tk) {
      setErrorMsg("Link de convite inválido ou expirado. Entre em contato com o seu anfitrião.");
      setLoading(false);
      return;
    }
    setToken(tk);
    validateInvite(tk);
  }, []);

  const validateInvite = async (tk: string) => {
    try {
      const res = await fetch("/api/invites/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tk }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Erro ao validar convite");
      }
      setInvitation(data);
    } catch (err: any) {
      setErrorMsg(err.message || "Falha na validação do convite.");
    } finally {
      setLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      setCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Erro ao acessar câmera:", err);
      setCameraActive(false);
      alert("Não foi possível acessar a câmera do dispositivo. Faça o upload de uma foto.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        setPhotoBase64(dataUrl);
        stopCamera();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !lgpdConsent) return;

    try {
      setLoading(true);
      const res = await fetch("/api/invites/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          doc,
          plate,
          photoBase64,
          lgpdConsent
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Erro ao completar convite");
      }
      setSuccess(true);
    } catch (err: any) {
      alert(err.message || "Erro ao concluir cadastro do visitante.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-6">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
        <p className="mt-4 text-sm text-zinc-400">Carregando convite...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-6">
        <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-950 border border-red-800 text-red-400 mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-3">Convite Inválido</h2>
          <p className="text-sm text-zinc-400 leading-relaxed mb-6">{errorMsg}</p>
          <a href="/login" className="inline-flex w-full items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 h-12 text-sm font-semibold transition-all">
            Ir para o Login
          </a>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-6">
        <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">Acesso Liberado!</h2>
          <p className="text-sm text-zinc-400 leading-relaxed mb-6">
            Seu cadastro foi concluído com sucesso. O reconhecimento facial já está ativo e você pode acessar o condomínio.
          </p>
          <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-4 mb-6 text-left space-y-2">
            <div className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Detalhes do Acesso</div>
            <div className="text-sm text-zinc-200"><span className="text-zinc-500">Visitante:</span> {invitation?.name}</div>
            <div className="text-sm text-zinc-200"><span className="text-zinc-500">Anfitrião:</span> {invitation?.hostName}</div>
            <div className="text-sm text-zinc-200"><span className="text-zinc-500">Unidade:</span> {invitation?.unit}</div>
          </div>
          <p className="text-xs text-zinc-500 leading-normal">
            Dirija-se ao leitor facial na portaria para efetuar sua entrada.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">Completar Cadastro</h1>
          <p className="text-sm text-zinc-400">
            Você foi convidado por <span className="font-semibold text-zinc-200">{invitation?.hostName}</span> para visitar a unidade <span className="font-semibold text-zinc-200">{invitation?.unit}</span>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Nome Completo</label>
              <input
                type="text"
                disabled
                value={invitation?.name || ""}
                className="w-full h-12 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 px-4 text-sm focus:outline-none cursor-not-allowed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Documento (CPF / RG)</label>
                <input
                  type="text"
                  required
                  placeholder="Informe seu documento"
                  value={doc}
                  onChange={(e) => setDoc(e.target.value)}
                  className="w-full h-12 rounded-xl bg-zinc-950 border border-zinc-800 text-white px-4 text-sm focus:border-blue-500 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Placa do Veículo (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: ABC-1234"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  className="w-full h-12 rounded-xl bg-zinc-950 border border-zinc-800 text-white px-4 text-sm focus:border-blue-500 focus:outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center border-t border-b border-zinc-800/50 py-6">
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4 text-center">Foto Facial (Obrigatória)</label>
            
            {photoBase64 ? (
              <div className="relative h-64 w-64 rounded-2xl border-2 border-zinc-800 overflow-hidden bg-zinc-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoBase64} alt="Preview" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoBase64(null)}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center justify-center rounded-full bg-red-600 hover:bg-red-500 text-white h-10 px-4 text-xs font-medium transition-all shadow-lg"
                >
                  Remover e Tirar Outra
                </button>
              </div>
            ) : cameraActive ? (
              <div className="relative h-64 w-64 rounded-2xl border-2 border-zinc-800 overflow-hidden bg-zinc-950">
                <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover scale-x-[-1]"></video>
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 px-4">
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 text-white h-10 px-4 text-xs font-semibold transition-all shadow-lg"
                  >
                    Capturar
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 text-white h-10 px-4 text-xs font-semibold transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-64 w-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-800 bg-zinc-950 hover:border-zinc-700 transition-all p-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 mb-4 text-zinc-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                </div>
                <button
                  type="button"
                  onClick={startCamera}
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 h-10 px-4 text-xs font-semibold text-white transition-all shadow-lg shadow-blue-500/10 mb-2 w-full"
                >
                  Tirar Foto com a Câmera
                </button>
                <label className="inline-flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 h-10 px-4 text-xs font-semibold text-zinc-300 cursor-pointer transition-all w-full">
                  Fazer Upload de Foto
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            )}
            
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="lgpd"
              required
              checked={lgpdConsent}
              onChange={(e) => setLgpdConsent(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-zinc-800 bg-zinc-950 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="lgpd" className="text-xs text-zinc-400 leading-normal cursor-pointer select-none">
              Autorizo o condomínio a coletar e processar meus dados pessoais e imagem facial para fins exclusivos de segurança e controle de acesso, em conformidade com a LGPD (Lei Geral de Proteção de Dados).
            </label>
          </div>

          <button
            type="submit"
            disabled={!photoBase64 || !doc || !lgpdConsent}
            className="flex w-full items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed h-12 text-sm font-semibold transition-all shadow-lg shadow-emerald-500/10"
          >
            Concluir Cadastro e Liberar Acesso
          </button>
        </form>
      </div>
    </div>
  );
}
