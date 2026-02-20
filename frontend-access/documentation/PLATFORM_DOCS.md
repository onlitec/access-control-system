# Documentação Técnica: Calabasas Access Control Panel (HikCentral Integration)

## 1. Visão Geral
O **Calabasas Access Control Panel** é uma interface administrativa e de autoatendimento integrada ao **HikCentral Professional** via OpenAPI. O sistema visa modernizar o controle de acesso do condomínio Calabasas Resort, permitindo a gestão centralizada de moradores, visitantes e prestadores de serviço.

## 2. Arquitetura do Sistema
*   **Frontend**: React + Vite + TailwindCSS + Shadcn/UI.
*   **Backend as a Service**: Supabase (Autenticação, Banco de Dados PostgreSQL e Storage).
*   **Integração**: HikCentral Professional OpenAPI (Versão 3.0.1+).
*   **Segurança**: Autenticação AK/SK com assinatura HMAC-SHA256 para chamadas HikCentral.

## 3. Implementações Realizadas

### 3.1. Módulo HikCentral (`hikcentral.ts`)
*   **Assinatura Robusta**: Implementação completa do algoritmo de assinatura da Hikvision (Method + Accept + Content-Type + x-ca-headers + Path).
*   **Compatibilidade V1**: Ajustado para usar a API V1 de reserva de visitantes (`/api/visitor/v1/visitor/reserve`), garantindo compatibilidade com versões anteriores da plataforma do cliente.
*   **Gestão de Moradores**: Implementada função `addPerson` para sincronizar novos moradores com foto.

### 3.2. Portal de Autoatendimento do Morador (`ResidentSelfService.tsx`)
*   **Página Pública**: Rota `/setup/:id` que permite ao morador cadastrar visitantes de seu próprio celular.
*   **Captura de Foto**: Integração com a câmera do celular para envio de biometria facial.
*   **Agendamento Instantâneo**: Criação de reserva no HikCentral no momento do envio.

### 3.3. Gestão Administrativa
*   **Moradores**: Tabela com status de sincronização e ferramenta para copiar link do portal.
*   **Visitantes/Prestadores**: Fluxo de cadastro com vínculo ao morador visitado e sincronização automática.
*   **Interface Dashboad**: Indicador de status da sincronização HikCentral (Ativa/Inativa).

## 4. Configuração da Integração
Os dados configurados para operação real são:
*   **IP Servidor**: `100.77.145.39`
*   **Porta**: `443` (HTTPS)
*   **App Key**: `26269542`
*   **App Secret**: `AYmE6LIQrwJC81Rv1c6J`

## 5. Funcionalidades Pendentes e Melhorias Próximas

### 5.1. Sincronização de Cadastro (Importação)
*   **Pendência**: Implementar um script ou botão no painel para importar moradores que já existem no HikCentral mas não estão no banco de dados local do portal.
*   **Motivo**: Evitar duplicidade de cadastros.

### 5.2. Gestão de Níveis de Acesso Dinâmicos
*   **Pendência**: Atualmente o sistema usa grupos de privilégios padrão. Implementar a seleção de "Níveis de Acesso" por bloco/unidade no cadastro de visitantes.

### 5.3. Logs de Acesso em Tempo Real
*   **Pendência**: Configurar o webhook (Event Subscription) do HikCentral para receber as batidas de cartão/face e exibi-las instantaneamente no Portal.
*   **Status**: A página de histórico já existe, mas depende do processamento de logs ou batida de API manual.

### 5.4. Deploy e Build
*   **Pendência**: Rodar o build de produção (`npm run build`) e configurar um servidor web (Nginx ou Apache) para servir os arquivos estáticos no servidor `172.20.120.41`.

---
**Documentação gerada em**: 18 de Fevereiro de 2026.
**Responsável**: Engenharia de Integração.
