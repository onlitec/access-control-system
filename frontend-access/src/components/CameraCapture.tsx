import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Camera as CameraIcon, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CameraCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cameraType: 'facial' | 'document';
  onCapture: (imageUrl: string) => void;
  title?: string;
  description?: string;
}

interface CameraDevice {
  id: string;
  name: string;
}

export function CameraCapture({
  open,
  onOpenChange,
  cameraType,
  onCapture,
  title,
  description
}: CameraCaptureProps) {
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (open) {
      loadCameras();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [open]);

  useEffect(() => {
    if (selectedCamera && open) {
      startCamera(selectedCamera);
    }
  }, [selectedCamera, open]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const loadCameras = async () => {
    try {
      setLoading(true);
      setError(null);
      // Solicita permissão primeiro, para poder listar os nomes das câmeras
      await navigator.mediaDevices.getUserMedia({ video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');

      const availableCameras = videoDevices.map((device, index) => ({
        id: device.deviceId,
        name: device.label || `Câmera ${index + 1}`
      }));

      setCameras(availableCameras);
      if (availableCameras.length > 0) {
        setSelectedCamera(availableCameras[0].id);
      } else {
        setError('Nenhuma câmera encontrada no dispositivo.');
      }
    } catch (err: any) {
      setError('Permissão de câmera negada ou erro ao carregar câmeras.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const startCamera = async (deviceId: string) => {
    stopCamera();
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      setError('Erro ao iniciar stream da câmera.');
      console.error(err);
    }
  };

  const captureFromCamera = async () => {
    if (!videoRef.current) return;
    try {
      setCapturing(true);

      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const imageUrl = canvas.toDataURL('image/jpeg', 0.85);
        onCapture(imageUrl);
        setTimeout(() => {
          onOpenChange(false);
        }, 500);
      } else {
        throw new Error("Não foi possível criar imagem do canvas.");
      }
    } catch (err: any) {
      setError('Erro ao capturar imagem.');
      console.error(err);
    } finally {
      setCapturing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {title || `Capturar ${cameraType === 'facial' ? 'Foto Facial' : 'Foto do Documento'}`}
          </DialogTitle>
          <DialogDescription>
            {description || `Selecione a câmera e capture a ${cameraType === 'facial' ? 'foto do rosto' : 'foto do documento'}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {cameras.length > 0 && (
                <div className="space-y-2">
                  <Label>Câmera</Label>
                  <Select value={selectedCamera} onValueChange={setSelectedCamera}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a câmera" />
                    </SelectTrigger>
                    <SelectContent>
                      {cameras.map((camera) => (
                        <SelectItem key={camera.id} value={camera.id}>
                          {camera.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2 relative border rounded-lg bg-black overflow-hidden flex items-center justify-center" style={{ minHeight: '300px' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-auto"
                />
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={capturing}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={captureFromCamera}
                  disabled={!selectedCamera || capturing || cameras.length === 0}
                >
                  {capturing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Capturando...
                    </>
                  ) : (
                    <>
                      <CameraIcon className="mr-2 h-4 w-4" />
                      Capturar Imagem
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
