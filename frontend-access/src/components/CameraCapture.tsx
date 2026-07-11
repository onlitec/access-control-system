import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Camera as CameraIcon, Loader2, AlertCircle, Video } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { authRequest } from '@/services/authApi';

interface CameraCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cameraType: 'facial' | 'document';
  onCapture: (imageUrl: string) => void;
  title?: string;
  description?: string;
  defaultTab?: 'webcam' | 'doorbell';
}

interface CameraDevice { id: string; name: string; }
interface CaptureDevice {
  key: string; // `${source}:${id}` — único entre videoporteiros e terminais faciais
  id: string;
  name: string;
  location?: string;
  source: 'doorbell' | 'facial';
}

const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') + '/api';

const SOURCE_LABEL: Record<CaptureDevice['source'], string> = {
  doorbell: 'Videoporteiro',
  facial: 'Terminal Facial',
};

function deviceBasePath(device: CaptureDevice) {
  return device.source === 'facial'
    ? `${API_BASE}/facial-access/devices/${device.id}`
    : `${API_BASE}/doorbell/devices/${device.id}`;
}

function getToken() {
  return localStorage.getItem('token') || localStorage.getItem('auth_token') || '';
}

function mjpegUrl(device: CaptureDevice) {
  return `${deviceBasePath(device)}/stream?token=${encodeURIComponent(getToken())}`;
}

export function CameraCapture({
  open,
  onOpenChange,
  cameraType,
  onCapture,
  title,
  description,
  defaultTab = 'webcam',
}: CameraCaptureProps) {
  const [source, setSource] = useState<'webcam' | 'doorbell'>(defaultTab);

  // Reset to defaultTab each time the dialog opens
  useEffect(() => {
    if (open) setSource(defaultTab);
  }, [open, defaultTab]);

  // ── Webcam state ──────────────────────────────────────────────────────────
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [webcamLoading, setWebcamLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Doorbell state (videoporteiros + terminais faciais) ──────────────────
  const [doorbells, setDoorbells] = useState<CaptureDevice[]>([]);
  const [selectedDoorbell, setSelectedDoorbell] = useState('');
  const [doorbellOnline, setDoorbellOnline] = useState<boolean | null>(null);
  const [doorbellError, setDoorbellError] = useState<string | null>(null);
  const [doorbellLoading, setDoorbellLoading] = useState(false);
  const mjpegImgRef = useRef<HTMLImageElement>(null);

  // ── Capture state ─────────────────────────────────────────────────────────
  const [capturing, setCapturing] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Webcam lifecycle
  // ─────────────────────────────────────────────────────────────────────────
  const stopWebcam = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const loadCameras = async () => {
    setWebcamLoading(true);
    setWebcamError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const list = devices
        .filter(d => d.kind === 'videoinput')
        .map((d, i) => ({ id: d.deviceId, name: d.label || `Câmera ${i + 1}` }));
      setCameras(list);
      if (list.length > 0 && !selectedCamera) setSelectedCamera(list[0].id);
      if (list.length === 0) setWebcamError('Nenhuma câmera encontrada.');
    } catch {
      setWebcamError('Permissão de câmera negada ou câmera não disponível.');
    } finally {
      setWebcamLoading(false);
    }
  };

  const startWebcam = async (deviceId: string) => {
    stopWebcam();
    setWebcamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setWebcamError('Erro ao iniciar câmera selecionada.');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Doorbell lifecycle
  // ─────────────────────────────────────────────────────────────────────────
  const loadDoorbells = async () => {
    setDoorbellLoading(true);
    setDoorbellError(null);
    try {
      const [doorbellList, facialList] = await Promise.all([
        authRequest<any>('/doorbell/devices')
          .then((res) => (res.devices || []).map((d: any): CaptureDevice => ({
            key: `doorbell:${d.id}`, id: d.id, name: d.name, location: d.location, source: 'doorbell',
          })))
          .catch(() => [] as CaptureDevice[]),
        authRequest<any>('/facial-access/devices')
          .then((res) => (res.devices || [])
            .filter((d: any) => d.enabled !== false)
            .map((d: any): CaptureDevice => ({
              key: `facial:${d.id}`, id: d.id, name: d.name, location: d.location, source: 'facial',
            })))
          .catch(() => [] as CaptureDevice[]),
      ]);
      const list = [...doorbellList, ...facialList];
      setDoorbells(list);
      if (list.length > 0 && !selectedDoorbell) setSelectedDoorbell(list[0].key);
      if (list.length === 0) setDoorbellError('Nenhum dispositivo configurado.');
    } catch {
      setDoorbellError('Erro ao carregar dispositivos.');
    } finally {
      setDoorbellLoading(false);
    }
  };

  const startMjpeg = (deviceKey: string) => {
    const img = mjpegImgRef.current;
    const device = doorbells.find((d) => d.key === deviceKey);
    if (!img || !device) return;
    setDoorbellOnline(null);
    img.src = mjpegUrl(device);
  };

  const stopMjpeg = () => {
    const img = mjpegImgRef.current;
    if (img) img.src = '';
    setDoorbellOnline(null);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      stopWebcam();
      stopMjpeg();
      return;
    }
    if (source === 'webcam') {
      stopMjpeg();
      loadCameras();
    } else {
      stopWebcam();
      loadDoorbells();
    }
    return () => { stopWebcam(); stopMjpeg(); };
  }, [open, source]);

  useEffect(() => {
    if (source === 'webcam' && selectedCamera && open) startWebcam(selectedCamera);
  }, [selectedCamera, source, open]);

  // doorbellLoading must be in deps: the <img> is only mounted after loading=false,
  // so startMjpeg must run after the render that hides the spinner.
  useEffect(() => {
    if (source === 'doorbell' && selectedDoorbell && open && !doorbellLoading) startMjpeg(selectedDoorbell);
    else if (source === 'doorbell' && !selectedDoorbell) stopMjpeg();
  }, [selectedDoorbell, source, open, doorbellLoading]);

  // ─────────────────────────────────────────────────────────────────────────
  // Capture
  // ─────────────────────────────────────────────────────────────────────────
  const captureImage = async () => {
    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas não disponível');

      if (source === 'webcam') {
        const video = videoRef.current;
        if (!video || !video.videoWidth) throw new Error('Vídeo não disponível');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
      } else {
        // Capture current frame from MJPEG <img>
        // Fetch the current snapshot directly (avoids crossOrigin taint from live stream)
        const device = doorbells.find((d) => d.key === selectedDoorbell);
        if (!device) throw new Error('Dispositivo não selecionado');
        const res = await fetch(`${deviceBasePath(device)}/snapshot`, {
          headers: { Authorization: `Bearer ${getToken()}` },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) throw new Error(`Falha na captura: ${res.status}`);
        const blob = await res.blob();
        const bitmapUrl = URL.createObjectURL(blob);
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(bitmapUrl);
            resolve();
          };
          img.onerror = reject;
          img.src = bitmapUrl;
        });
      }

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      onCapture(dataUrl);
      setTimeout(() => onOpenChange(false), 300);
    } catch (err: any) {
      if (source === 'webcam') setWebcamError(err.message || 'Erro ao capturar.');
      else setDoorbellError(err.message || 'Erro ao capturar frame do dispositivo.');
    } finally {
      setCapturing(false);
    }
  };

  const canCapture =
    !capturing &&
    (source === 'webcam'
      ? !!selectedCamera && cameras.length > 0
      : !!selectedDoorbell && doorbellOnline === true);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px]" aria-describedby="camera-capture-desc">
        <DialogHeader>
          <DialogTitle>
            {title || `Capturar ${cameraType === 'facial' ? 'Foto Facial' : 'Foto do Documento'}`}
          </DialogTitle>
          <DialogDescription id="camera-capture-desc">
            {description || `Selecione a fonte e capture a ${cameraType === 'facial' ? 'foto do rosto' : 'foto do documento'}`}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={source} onValueChange={v => setSource(v as 'webcam' | 'doorbell')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="webcam">
              <CameraIcon className="w-4 h-4 mr-2" />
              Câmera Local
            </TabsTrigger>
            <TabsTrigger value="doorbell">
              <Video className="w-4 h-4 mr-2" />
              Dispositivo
            </TabsTrigger>
          </TabsList>

          <div className="space-y-4 mt-4">

            {/* ── WEBCAM TAB ─────────────────────────────────────────── */}
            <TabsContent value="webcam" className="m-0 space-y-3">
              {webcamError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{webcamError}</AlertDescription>
                </Alert>
              )}
              {webcamLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {cameras.length > 1 && (
                    <div className="space-y-1">
                      <Label>Câmera</Label>
                      <Select value={selectedCamera} onValueChange={setSelectedCamera}>
                        <SelectTrigger><SelectValue placeholder="Selecione a câmera" /></SelectTrigger>
                        <SelectContent>
                          {cameras.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div
                    className="relative rounded-lg overflow-hidden bg-black border border-border flex items-center justify-center"
                    style={{ aspectRatio: '4/3' }}
                  >
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    {/* Live badge */}
                    <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      AO VIVO
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ── DOORBELL TAB ───────────────────────────────────────── */}
            <TabsContent value="doorbell" className="m-0 space-y-3">
              {doorbellError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{doorbellError}</AlertDescription>
                </Alert>
              )}
              {doorbellLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {doorbells.length > 1 && (
                    <div className="space-y-1">
                      <Label>Dispositivo</Label>
                      <Select value={selectedDoorbell} onValueChange={setSelectedDoorbell}>
                        <SelectTrigger><SelectValue placeholder="Selecione o equipamento" /></SelectTrigger>
                        <SelectContent>
                          {doorbells.map(d => (
                            <SelectItem key={d.key} value={d.key}>
                              {SOURCE_LABEL[d.source]} — {d.name}{d.location ? ` (${d.location})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* MJPEG live stream — 16:9 sem corte (stream nativo do aparelho) */}
                  <div
                    className="relative rounded-lg overflow-hidden bg-black border border-border flex items-center justify-center"
                    style={{ aspectRatio: '16/9' }}
                  >
                    {/* Hidden until online, avoids broken-image icon */}
                    <img
                      ref={mjpegImgRef}
                      alt="stream do dispositivo"
                      className="w-full h-full object-contain"
                      style={{ display: doorbellOnline === false ? 'none' : 'block' }}
                      onLoad={() => setDoorbellOnline(true)}
                      onError={() => {
                        setDoorbellOnline(false);
                        setTimeout(() => {
                          const device = doorbells.find((d) => d.key === selectedDoorbell);
                          if (mjpegImgRef.current && device)
                            mjpegImgRef.current.src = mjpegUrl(device);
                        }, 3000);
                      }}
                    />

                    {doorbellOnline === null && selectedDoorbell && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-7 w-7 animate-spin" />
                        <span className="text-xs">Conectando ao dispositivo...</span>
                      </div>
                    )}

                    {doorbellOnline === false && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <AlertCircle className="h-7 w-7 text-destructive/60" />
                        <span className="text-xs text-destructive/80">Sem sinal — reconectando...</span>
                      </div>
                    )}

                    {!selectedDoorbell && !doorbellLoading && doorbells.length === 0 && (
                      <span className="text-xs text-muted-foreground">Nenhum dispositivo configurado</span>
                    )}

                    {doorbellOnline === true && (
                      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        AO VIVO
                      </div>
                    )}
                  </div>

                  {doorbellOnline === true && (
                    <p className="text-xs text-muted-foreground text-center">
                      Clique em <strong>Capturar Imagem</strong> para tirar uma foto do frame atual
                    </p>
                  )}
                </>
              )}
            </TabsContent>

            {/* ── ACTIONS ──────────────────────────────────────────────── */}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={capturing}>
                Cancelar
              </Button>
              <Button onClick={captureImage} disabled={!canCapture}>
                {capturing ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Capturando...</>
                ) : (
                  <><CameraIcon className="mr-2 h-4 w-4" />Capturar Imagem</>
                )}
              </Button>
            </div>

          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
