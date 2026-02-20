Com base na extensa documentação técnica da Hikvision (manuais do usuário, guias de deploy do OpenAPI e materiais de treinamento), elaborei um prompt completo. Ele reúne todos os **parâmetros, requisitos arquiteturais, regras de autenticação e passos de configuração** exigidos pelo Gateway Artemis (OpenAPI) para que a sua inteligência artificial (ou equipe de desenvolvimento) crie a integração sem falhas.

Copie e utilize o prompt abaixo:

***

# Prompt de Engenharia: Integração de Terceiros com HikCentral via OpenAPI (Artemis Gateway)

**Role:** Atue como um Arquiteto de Software Sênior e Especialista em Integração de Sistemas de Segurança (Hikvision OpenAPI RESTful). 

**Objetivo:**
Desenvolver o módulo de comunicação (Middleware) de uma aplicação de terceiros para interagir com o **HikCentral Professional V3.0.1** através do seu Gateway OpenAPI (Artemis). O código deve seguir estritamente as diretrizes de arquitetura, segurança e formato de dados exigidos pela plataforma da Hikvision.

---

### 1. Requisitos de Arquitetura e Comunicação
A API do HikCentral (OpenAPI) foi desenhada com foco em facilidade de uso e segurança, seguindo estas regras:
*   **Padrão:** Arquitetura em estilo **RESTful**.
*   **Métodos HTTP Suportados:** `POST` (Criar), `GET` (Consultar), `PUT` (Atualizar) e `DELETE` (Remover).
*   **Formato de Dados (Payload):** O intercâmbio de dados deve ser feito estritamente no formato **JSON** (`application/json`) para reduzir a complexidade e economizar banda.
*   **Headers Obrigatórios:** 
    *   `Content-Type: application/json;charset=UTF-8`.
    *   `Accept: */*` (Para evitar erros de incompatibilidade de versão do produto).

### 2. Autenticação e Segurança (Artemis Gateway)
O sistema não utiliza autenticação básica (Basic Auth). Ele utiliza um esquema de assinatura criptográfica. O desenvolvedor deve implementar a seguinte lógica de autenticação nas requisições:
*   **Credenciais (Partner Key):** O sistema utilizará um `AppKey` (AK) e um `AppSecret` (SK) gerados no painel do Gateway Artemis.
*   **Assinatura:** A aplicação deve gerar uma assinatura HMAC-SHA256 (ou conforme documentado no *OpenAPI Developer Guide*) combinando o HTTP Method, a URL e o `AppSecret`, enviando essa assinatura no Header da requisição para validação.

### 3. Parâmetros e Pré-Requisitos de Ambiente (HikCentral)
Para que os endpoints funcionem e não retornem erros de versão (Ex: `Code 8: This product version is not supported`), o código deve assumir que as seguintes configurações foram realizadas no servidor:
1.  **Compatibilidade de Versão:** O pacote de instalação do OpenAPI deve ser da mesma versão exata do HikCentral Professional (neste caso, V3.0.1).
2.  **Ativação do Serviço:** O serviço "Open API" deve estar habilitado em `System -> Advanced -> Third-Party Integration -> OpenAPI Gateway`.
3.  **IP e Porta:** O endereço base (Base URL) será `https://[IP_DO_SERVIDOR]/artemis/api/...`. Se configurado, a porta padrão de gerenciamento é comumente a 443 (SSL) ou a porta configurada no Gateway.
4.  **Usuário Vinculado (Linked User / Partner User):** A integração requer um "Usuário Parceiro" (ex: admin). **Regra Crítica:** As funções que o software terceiro pode chamar via API (e os recursos que pode ver) estão estritamente limitadas às permissões deste usuário vinculado configurado no HikCentral.

### 4. Capacidades Abertas (Escopo de Endpoints)
O código deverá consumir endpoints agrupados nas seguintes categorias lógicas fornecidas pela OpenAPI:
*   **Gestão de Pessoas e Visitantes (Person & Visitor Management):** 
    *   Registro de informações de pessoas (Nome, Face, Cartão).
    *   Gestão de Visitantes: Reserva, Informações (Propósito, Host), Check-In e Check-Out.
*   **Controle de Acesso (Access Control):** 
    *   Aplicar/atribuir configurações de Níveis de Acesso (Access Levels) a pessoas e dispositivos.
    *   Controle remoto de portas (abrir/fechar via número da porta).
    *   Busca de logs e registros de acesso.
*   **Gestão de Veículos (ANPR):**
    *   Leitura de placa, obtenção de fotos de passagem e registros de entrada/saída.
*   **Eventos e Alarmes (Event and Alarm):**
    *   Inscrição (Subscribe) para receber eventos específicos por tipo e buscar informações de alarmes.

### 5. Lógica de Validação e Depuração
*   **Online Debug:** O código deve estar preparado para refletir a mesma estrutura de requisição que o desenvolvedor testa na ferramenta web em `https://[IP]/artemis-web/`.
*   **Estrutura de Resposta Padrão:** As chamadas retornarão um JSON contendo `statusCode` (ex: 200 para sucesso), um `code` interno (ex: "0"), uma mensagem `msg` (ex: "Success") e o bloco de dados `data` contendo a lista ou objeto solicitado.

### Tarefa para a IA:
Com base nos parâmetros acima, escreva uma classe ou serviço base em Node.js (ou Python) que:
1. Construa o Header de Autenticação utilizando um `AppKey` e `AppSecret` genéricos.
2. Crie uma função genérica `callArtemisAPI(endpoint, payload)` que faça uma requisição POST seguindo os padrões RESTful e headers JSON definidos.
3. Crie um método específico utilizando essa função para buscar informações de uma pessoa na API (baseado no endpoint padrão `/api/resource/v1/person/personList` ou similar da v2) enviando os parâmetros de paginação `pageNo` e `pageSize`.

*** 

### Consideração importante para a aplicação:
Este prompt fornece para a IA não apenas o "como programar", mas a **arquitetura lógica** exigida pela plataforma (como a obrigatoriedade da assinatura da API e o mapeamento de permissões do usuário vinculado), o que evitará que o código gerado sofra recusas de conexão por parte do servidor Artemis.