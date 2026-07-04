import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { setAuthSession, type AuthUser } from '@/services/authApi';
import { ShieldCheck, MailCheck } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || (window.location.origin + '/api');

async function setupRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/setup${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Falha na requisição (${response.status})`);
  }
  return data as T;
}

export default function FirstSetupPage() {
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // se o sistema já foi configurado, este assistente não se aplica
    setupRequest<{ needsSetup: boolean }>('/status')
      .then(({ needsSetup }) => {
        if (!needsSetup) navigate('/login', { replace: true });
      })
      .catch(() => undefined);
  }, [navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const sendCode = async () => {
    await setupRequest('/register', { name, email, password });
    setResendCooldown(60);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) {
      toast({ title: 'Erro', description: 'Preencha e-mail e senha', variant: 'destructive' });
      return;
    }
    if (password.length < 8) {
      toast({ title: 'Erro', description: 'A senha deve ter pelo menos 8 caracteres', variant: 'destructive' });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: 'Erro', description: 'As senhas não conferem', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      await sendCode();
      setStep('code');
      toast({
        title: 'Código enviado',
        description: `Enviamos um código de verificação para ${email}`,
      });
    } catch (error) {
      toast({
        title: 'Erro ao enviar o código',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      toast({ title: 'Erro', description: 'Informe o código de 6 dígitos', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const data = await setupRequest<{ token: string; refreshToken: string; user: AuthUser }>(
        '/verify',
        { email, code: code.trim() },
      );
      setAuthSession(data.token, data.refreshToken, data.user);
      toast({ title: 'Cadastro concluído', description: 'Bem-vindo ao OnliAcesso!' });
      // recarrega para o AuthContext hidratar a sessão recém-criada
      window.location.href = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/dashboard`;
    } catch (error) {
      toast({
        title: 'Erro na verificação',
        description: (error as Error).message,
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setIsLoading(true);
    try {
      await sendCode();
      toast({ title: 'Código reenviado', description: `Novo código enviado para ${email}` });
    } catch (error) {
      toast({
        title: 'Erro ao reenviar',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              {step === 'form'
                ? <ShieldCheck className="h-8 w-8 text-primary" />
                : <MailCheck className="h-8 w-8 text-primary" />}
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">
            {step === 'form' ? 'Bem-vindo ao OnliAcesso' : 'Verifique seu e-mail'}
          </CardTitle>
          <CardDescription>
            {step === 'form'
              ? 'Cadastre o administrador do sistema para começar'
              : `Digite o código de 6 dígitos enviado para ${email}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'form' ? (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="setup-name">Nome</Label>
                <Input
                  id="setup-name"
                  type="text"
                  placeholder="Seu nome (opcional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-email">E-mail</Label>
                <Input
                  id="setup-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-password">Senha</Label>
                <Input
                  id="setup-password"
                  type="password"
                  placeholder="Crie uma senha (mínimo 8 caracteres)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-confirm">Confirmar senha</Label>
                <Input
                  id="setup-confirm"
                  type="password"
                  placeholder="Repita a senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Enviando código...' : 'Cadastrar e receber código'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="setup-code">Código de verificação</Label>
                <Input
                  id="setup-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Verificando...' : 'Confirmar código'}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                  onClick={() => { setStep('form'); setCode(''); }}
                  disabled={isLoading}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline"
                  onClick={handleResend}
                  disabled={isLoading || resendCooldown > 0}
                >
                  {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar código'}
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
