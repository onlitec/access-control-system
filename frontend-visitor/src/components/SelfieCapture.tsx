"use client";

import { useRef, useState } from "react";

interface SelfieCaptureProps {
  photoBase64: string | null;
  onCapture: (photoBase64: string) => void;
  onClear: () => void;
}

/**
 * Captura de selfie via webcam (getUserMedia + canvas), com fallback de
 * upload de arquivo. Mesmo padrão usado em login/guest-complete/page.tsx.
 */
export default function SelfieCapture({ photoBase64, onCapture, onClear }: SelfieCaptureProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
        onCapture(dataUrl);
        stopCamera();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onCapture(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center">
      {photoBase64 ? (
        <div className="relative h-64 w-64 rounded-2xl border-2 border-zinc-800 overflow-hidden bg-zinc-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoBase64} alt="Preview" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={onClear}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center justify-center rounded-full bg-red-600 hover:bg-red-500 text-white h-10 px-4 text-xs font-medium transition-all shadow-lg"
          >
            Remover e Tirar Outra
          </button>
        </div>
      ) : cameraActive ? (
        <div className="relative h-64 w-64 rounded-2xl border-2 border-zinc-800 overflow-hidden bg-zinc-950">
          <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover scale-x-[-1]" />
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
          <button
            type="button"
            onClick={startCamera}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 h-10 px-4 text-xs font-semibold text-white transition-all shadow-lg shadow-blue-500/10 mb-2 w-full"
          >
            Tirar Selfie com a Câmera
          </button>
          <label className="inline-flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 h-10 px-4 text-xs font-semibold text-zinc-300 cursor-pointer transition-all w-full">
            Fazer Upload de Foto
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
