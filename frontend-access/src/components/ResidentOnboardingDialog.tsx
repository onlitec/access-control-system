import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Copy, Mail, MessageSquare, Send } from 'lucide-react';

export interface OnboardingSuccessInfo {
  url: string;
  phone?: string;
  email?: string;
}

interface ResidentOnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: OnboardingSuccessInfo | null;
}

/**
 * Dialog de sucesso pós-cadastro/geração de link de acesso do morador.
 * Recebe phone/email como dados (não depende do form da página), pois também
 * é disparado pelo botão "Gerar Link de Acesso" na tabela.
 */
export function ResidentOnboardingDialog({ open, onOpenChange, info }: ResidentOnboardingDialogProps) {
  const { toast } = useToast();

  const handleCopyLink = () => {
    if (info?.url) {
      navigator.clipboard.writeText(info.url);
      toast({
        title: 'Copiado!',
        description: 'Link copiado para a área de transferência',
      });
    }
  };

  const handleWhatsAppShare = () => {
    if (info?.url) {
      const message = `Olá! Seu cadastro de morador foi concluído no Calabasas. Acesse o link abaixo para registrar seus visitantes e prestadores: ${info.url}`;
      const phone = (info.phone || '').replace(/\D/g, '');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
    }
  };

  const handleEmailShare = () => {
    if (info?.url) {
      window.open(
        `mailto:${info.email || ''}?subject=Bem-vindo! Acesse seu App Visitor&body=Olá! Acesse o link para configurar seu acesso: ${info.url}`,
        '_blank'
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-full max-w-[640px] max-h-[90vh] overflow-y-auto border-none shadow-2xl bg-white"
        aria-describedby="resident-onboarding-description"
      >
        <DialogTitle className="sr-only">Convite Pronto</DialogTitle>
        <DialogDescription id="resident-onboarding-description" className="sr-only">
          Link de acesso do morador gerado com sucesso.
        </DialogDescription>
        <div className="flex-1 flex flex-col justify-center items-center bg-white p-6">
          <div className="text-center space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="h-24 w-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-14 w-14" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-zinc-900">Convite Pronto!</h2>
              <p className="text-muted-foreground mt-3 max-w-sm mx-auto text-lg">
                Compartilhe o link abaixo para que o morador configure sua senha.
              </p>
            </div>
            <div className="w-full max-w-lg bg-zinc-50 p-5 rounded-2xl border border-dashed border-zinc-200 flex flex-col gap-5 mx-auto">
              <div className="flex items-center justify-between gap-2 overflow-hidden bg-white p-4 rounded-xl border">
                <span className="text-base font-mono truncate text-zinc-600 flex-1 text-left">
                  {info?.url}
                </span>
                <Button variant="ghost" size="icon" onClick={handleCopyLink} className="shrink-0 h-10 w-10">
                  <Copy className="h-5 w-5" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Button variant="outline" className="flex flex-col h-auto py-4 gap-3 border-zinc-100 hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-all font-bold" onClick={handleWhatsAppShare}>
                  <MessageSquare className="h-6 w-6" />
                  <span className="text-[11px] uppercase tracking-wider">WhatsApp</span>
                </Button>
                <Button variant="outline" className="flex flex-col h-auto py-4 gap-3 border-zinc-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all font-bold" onClick={handleEmailShare}>
                  <Mail className="h-6 w-6" />
                  <span className="text-[11px] uppercase tracking-wider">E-mail</span>
                </Button>
                <Button variant="outline" className="flex flex-col h-auto py-4 gap-3 border-zinc-100 hover:bg-slate-50 hover:text-slate-600 hover:border-slate-200 transition-all font-bold">
                  <Send className="h-6 w-6" />
                  <span className="text-[11px] uppercase tracking-wider">SMS</span>
                </Button>
              </div>
            </div>
            <Button variant="link" onClick={() => onOpenChange(false)} className="text-zinc-500 font-medium text-lg mt-4">
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
