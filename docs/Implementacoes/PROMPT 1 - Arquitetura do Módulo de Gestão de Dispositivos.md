Implemente um novo módulo chamado "Gestão de Dispositivos".



Este módulo será responsável por descobrir, cadastrar, configurar, monitorar e gerenciar todos os dispositivos IP da plataforma.



A implementação deve seguir a arquitetura existente do sistema, utilizando Services, Providers, Controllers, Prisma e React.



O módulo deve ser totalmente independente do fabricante.



Os dispositivos serão classificados nas seguintes categorias:



\- Controladora de Acesso

\- Terminal Facial

\- Controladora Biométrica

\- Controladora RFID

\- Controladora Veicular

\- Câmera IP

\- Speed Dome

\- NVR

\- DVR

\- Videoporteiro

\- Interfone IP

\- Switch Gerenciável

\- Switch PoE

\- Roteador

\- Firewall

\- Controlador de Portão

\- Módulo Nice

\- Leitor Biométrico

\- Leitor QRCode

\- Leitor RFID

\- Sensor

\- Relé IP

\- Controlador ONVIF

\- Outro



Cada dispositivo deverá possuir:



UUID

Nome

Descrição

Fabricante

Modelo

Categoria

Subcategoria

Endereço MAC

IP

Gateway

Máscara

DNS

Hostname

Número de Série

Firmware

Hardware Version

Porta HTTP

Porta HTTPS

Porta RTSP

Porta SDK

Porta ONVIF

Usuário

Senha (criptografada)

Localização

Condomínio

Bloco

Status

Online

Última comunicação

Data de cadastro

Observações



Criar todas as tabelas Prisma.



Criar CRUD completo.



Criar APIs REST.



Criar páginas React.



Criar filtros.



Criar pesquisa.



Criar paginação.



Criar dashboard de dispositivos.



Tudo deve seguir o padrão visual já existente na plataforma.

