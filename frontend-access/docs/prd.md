# Documento de Requisitos da Aplicação Web de Gestão de Controle de Acesso para Condomínio

## 1. Nome da Aplicação
Sistema de Gestão de Controle de Acesso para Condomínio

## 2. Descrição da Aplicação
Aplicação web para gestão de controle de acesso em condomínios, permitindo o cadastro e gerenciamento de moradores, visitantes e prestadores de serviços (fixos ou eventuais). A plataforma integra-se com o Hikcentral versão 3.0.1 via OpenAPI para sincronização de dados e acesso direto às câmeras faciais e de documentos através da API, oferecendo uma interface amigável e simplificada para os usuários.

## 3. Funcionalidades Principais

### 3.1 Gestão de Moradores
- Cadastro de moradores com informações básicas
- Formulário de cadastro incluindo campo para captura de foto do rosto via API do Hikcentral acessando câmera facial
- Campo de cadastro da torre
- Listagem e busca de moradores cadastrados
- Edição e exclusão de registros de moradores
- Acesso via app do Hikcentral para cadastro de visitantes pelos moradores

### 3.2 Gestão de Visitantes
- Registro de visitantes
- Formulário de cadastro incluindo campos para captura de foto do rosto e foto do documento via API do Hikcentral
- Campo de cadastro da torre
- **Campo de seleção para escolher o morador/proprietário que será visitado, com funcionalidade de busca por digitação: ao digitar o nome completo, nome inicial, sobrenome inicial ou iniciais do nome/sobrenome, o campo automaticamente filtra e exibe os moradores com dados semelhantes cadastrados no Hikcentral**
- Controle de entrada e saída de visitantes
- Histórico de visitas
- Cadastro de visitantes realizado pelos moradores através do app do Hikcentral
- **Moradores fictícios para teste: João Silva (Torre A, Apto 101), Maria Santos (Torre B, Apto 205), Carlos Oliveira (Torre C, Apto 310), Ana Costa (Torre A, Apto 502)**

### 3.3 Gestão de Prestadores de Serviços
- Cadastro de prestadores fixos
- Cadastro de prestadores eventuais
- Formulário de cadastro incluindo campos para captura de foto do rosto e foto do documento via API do Hikcentral
- Campo de cadastro da torre
- **Campo de seleção para escolher o morador/proprietário que receberá o serviço, com funcionalidade de busca por digitação: ao digitar o nome completo, nome inicial, sobrenome inicial ou iniciais do nome/sobrenome, o campo automaticamente filtra e exibe os moradores com dados semelhantes cadastrados no Hikcentral**
- Controle de acesso de prestadores
- Diferenciação entre prestadores fixos e eventuais
- **Moradores fictícios para teste: João Silva (Torre A, Apto 101), Maria Santos (Torre B, Apto 205), Carlos Oliveira (Torre C, Apto 310), Ana Costa (Torre A, Apto 502)**

### 3.4 Integração com Hikcentral via OpenAPI
- Área de configuração para inserir parâmetros de conexão local com Hikcentral versão 3.0.1
- Configuração de credenciais e endpoints da OpenAPI
- Sincronização de dados entre a plataforma e o Hikcentral
- Gerenciamento dos dados carregados do Hikcentral
- Acesso direto às câmeras faciais e de documentos através da API do Hikcentral para captura de fotos
- Integração com app do Hikcentral para permitir cadastro de visitantes pelos moradores
- **Carregamento da lista de moradores/proprietários cadastrados no Hikcentral para preenchimento dos campos de seleção com busca nos formulários de visitantes e prestadores**

### 3.5 Dashboard
- Card exibindo visitantes que já saíram
- Visualização de informações consolidadas de acesso

### 3.6 Interface do Usuário
- Interface amigável e simplificada
- Navegação intuitiva entre as funcionalidades
- Design responsivo para acesso em diferentes dispositivos