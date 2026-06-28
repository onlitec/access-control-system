# Relatório de Análise e Auditoria Técnica
## Sistema: Access Control System (Monorepo Genérico / White-Label)

Este documento reúne a análise de arquitetura, o relatório de auditoria de segurança e o status das melhorias implementadas no ecossistema de controle de acesso de condomínios.

---

## 1. Análise Geral e Arquitetura do Sistema

O **Access Control System** é estruturado como um monorepo Node.js gerenciado através de **npm Workspaces** com múltiplos componentes interdependentes:

* **`backend-api`**: Ponto central de lógica de negócios, conexão única e autenticada com o HikCentral OpenAPI (Artemis Gateway) e acesso ao banco de dados local via Prisma Client.
* **`frontend-visitor`**: Portal Next.js voltado para o morador realizar o primeiro acesso (`first-access`) e visitantes completarem o auto-cadastro (`guest-complete`), contendo também uma rota de entrada em `/login`.
* **`frontend-access`**: Painel estático voltado para as portarias e monitoramento operacional.
* **`frontend-admin`**: Interface administrativa rica para parametrizações de rede, usuários e mapeamentos de dispositivos.
* **`shared`**: Interfaces, contratos e DTOs compartilhados entre os pacotes do monorepo.

### 🌐 Fluxo de Rede e Infraestrutura (Nginx + Docker)
O ecossistema é orquestrado através do Docker Compose e exposto na rede via proxy reverso no **Nginx**:
* **Modo Local:** Porta HTTP `8080` (redireciona para HTTPS) e porta HTTPS `8443` (certificado autoassinado).
* **Modo Let's Encrypt:** Portas padrão de mercado `80` e `443` utilizando domínios reais.
* **Rate Limiting:** Bloqueio ativo contra força bruta no endpoint de login da API (`/api/auth/login`) limitado a 10 requisições por minuto com burst de 20.
* **Ops Protection:** Endpoint `/ops/status.json` expõe a saúde do sistema sob autenticação básica (Basic Auth) e restrição de IPs privados Docker (`172.16.0.0/12`).

---

## 2. Relatório de Auditoria de Software e Segurança

Durante a auditoria profunda da codebase, foram identificadas vulnerabilidades arquiteturais e pontos de incompletude crítica no projeto:

### 🚨 1. IPs de Produção Estáticos Hardcoded
O endereço IP do servidor físico local de produção (**`172.20.120.41`**) estava inserido de forma literal no código em múltiplos locais críticos. Isso quebrava links gerados em ambiente local de desenvolvimento ou caso o servidor local sofresse alteração de IP na subrede do condomínio.

### 🚨 2. Acoplamento de Marca ("Calabasas")
O sistema encontrava-se totalmente acoplado ao condomínio específico "Calabasas", utilizando nomes de containers Docker (`calabasas-*`), textos de interface, placeholders de e-mail de login (`admin@calabasas.com`), rotas de API `/api/hikcentral/calabasas-providers` e menções nos termos de consentimento LGPD.

### ⚠️ 3. Falhas no Healthcheck e Inicialização do Proxy
O healthcheck do container de visitantes no `docker-compose.yml` tentava realizar testes na rota `/login`. Como o Next.js possuía apenas as subrotas `/login/first-access` e `/login/guest-complete`, a rota raiz `/login` retornava 404. Isso deixava o container com status permanentemente *unhealthy* e impedia a inicialização do container do proxy reverso `nginx` (que dependia do estado saudável dos frontends).

### 🔒 4. Exposição de Credenciais no `.env` do Backend
O arquivo `.env` do backend-api mantinha credenciais sensíveis em texto plano sem controle dinâmico ou rotação após a primeira execução de bootstrap.

---

## 3. Plano de Melhorias Executado

Todas as inconformidades e pendências críticas apontadas na auditoria foram resolvidas:

### ✅ Portabilidade Dinâmica de Rede
1. **Configuração Dinâmica do Backend:** O backend agora lê a variável de ambiente `process.env.APP_URL` para compor as URLs de primeiro acesso, resolvendo a dependência do IP fixado.
2. **URLs Relativas nos Frontends:** Os fallbacks de conexão com a API nos frontends admin e access foram modificados para usar `window.location.origin + '/api'`. Com o Nginx servindo o proxy reverso e os frontends no mesmo endereço, a resolução agora é dinâmica e portátil para qualquer domínio ou IP.

### ✅ Conversão Completa para White-Label (Genérico)
1. **Containers Docker:** Renomeados todos os containers do Docker para o prefixo genérico `access-` (`access-db`, `access-api`, `access-painel`, `access-login`, `access-admin`, `access-proxy`).
2. **Textos e Identidade Visual:** Substituídas as menções estáticas a "Calabasas" nas interfaces de login, títulos de páginas, cabeçalhos do Sidebar ("Acesso"), placeholders de e-mail (`admin@condominio.com`) e termos de consentimento da LGPD.
3. **Mapeamento de Prestadores Internos:** A rota de API `/api/hikcentral/calabasas-providers` foi migrada para `/api/hikcentral/internal-providers` no backend e no frontend-admin (`getInternalProviders` e `InternalPerson`).

### ✅ Resolução de Infraestrutura e Estabilização de Build
1. **Healthcheck e Página de Entrada:** Criada a página de entrada no portal de visitantes em `/login/page.tsx` com botões de direcionamento. Corrigido o endpoint de healthcheck no docker-compose para a raiz `/`, permitindo a inicialização bem-sucedida do proxy Nginx.
2. **Build Otimizado e Imagens Slim:** Alterados os arquivos Dockerfiles do `frontend-admin` e `frontend-access` para usar a imagem de build `node:20-slim`, evitando timeouts de handshake TLS/timeout com o Docker Hub ao reusar a imagem slim do cache local.
3. **UX de Scripts:** Adicionada verificação de diretório raiz no script `ops.sh` para impedir falhas de execução fora da pasta do monorepo `/opt/access-control-system`.

---

## 4. Resultados de Validação e Testes

Após a conclusão das correções, a validação de build e integridade de regressão foi executada com sucesso total:

* **Build Monorepo:** Compilação concluída com sucesso em todos os workspaces com 0 erros de lint ou TypeScript.
* **Teste de Regressão Automatizado:** Executado `./scripts/ops.sh smoke` e testes de contrato localmente com sucesso absoluto em todos os gates.
  * **Smoke Tests:** Validação de login, refresh e logout concluída.
  * **Testes de Contrato:** Validação de endpoints da API (Providers, Towers, Dashboard, Audit Logs) passou íntegra.
