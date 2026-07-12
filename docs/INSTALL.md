# Instalação do OnliAcesso (Windows e Linux)

Um único produto, uma única versão (`package.json` raiz), **dois instaladores**
gerados a cada release pela CI (`.github/workflows/release.yml`) e publicados em
`https://cloud.onlitec.com.br/downloads/`:

| Artefato | SO | Conteúdo |
|---|---|---|
| `OnliAcessoSetup-<v>.exe` (~300 MB) | Windows x64 | Tudo embutido: Node 20, PostgreSQL 16, nginx, ffmpeg, WinSW (+ MediaMTX/rclone p/ VMS) |
| `onliacesso-linux-<v>.tar.gz` (~9 MB) | Debian/Ubuntu | Apps compilados; dependências instaladas no destino pelo `install.sh` |
| `latest.json` | — | Manifesto de atualização (o Admin usa em "Verificar atualizações") |

## Requisitos

- 4 GB de RAM (8 GB com o VMS ativo), 20 GB de disco (+ espaço para gravações)
- Rede local com os equipamentos (leitores faciais, guarita, câmeras/DVRs)

## Windows

1. Baixar `https://cloud.onlitec.com.br/downloads/OnliAcessoSetup-<v>.exe`.
2. Conferir o SHA256 (arquivo `.sha256` ao lado): `Get-FileHash .\OnliAcessoSetup-<v>.exe`.
3. Executar como Administrador e seguir o assistente (nome do condomínio,
   componente VMS opcional). Ao final: `http://localhost/painel/` e `/admin/`.

**Windows suportado**: Windows 10/11 e Server 2019+ x64.

## Linux

### Compatibilidade

O instalador exige `apt` + systemd (recusa outras famílias de propósito):

| Distro | Status |
|---|---|
| **Ubuntu 22.04 LTS** (jammy) | Suportada — testada em produção (PostgreSQL 14) |
| **Ubuntu 24.04 LTS** (noble) | Suportada (PostgreSQL 16) |
| **Debian 12** (bookworm) | Suportada (PostgreSQL 15) |
| Debian 11 (bullseye) | Deve funcionar; não testada |
| RHEL / Fedora / Alpine / Arch | **Não suportadas** (sem apt/layout Debian) |

Arquitetura: amd64. arm64 deve funcionar (Node/MediaMTX detectam), não testada.

### Instalar do release oficial (recomendado — sem acesso ao repositório)

```bash
curl -fsSLO https://cloud.onlitec.com.br/downloads/onliacesso-linux-<v>.tar.gz
# ou, com o bootstrap (baixa, confere SHA256 e instala):
sudo ./bootstrap.sh --from-release          # bootstrap.sh vem dentro do tar.gz
```

Manual, a partir do tar.gz:

```bash
tar -xzf onliacesso-linux-<v>.tar.gz
sudo onliacesso-linux-<v>/install.sh        # [--no-vms] sem o módulo de câmeras
```

O `install.sh` instala Node 20 (NodeSource), PostgreSQL/nginx (apt), cria o
usuário de serviço, os units systemd e imprime as credenciais iniciais em
`/opt/onliacesso/config/credenciais.txt`.

### Instalar do código-fonte (desenvolvimento)

```bash
sudo ./installer/linux/bootstrap.sh   # dentro do repo; clona se rodado fora
```

## Atualizações

O painel **Admin → Configurações → Atualizações** consulta o `latest.json`
(default `UPDATE_MANIFEST_URL` já gravado no `.env` pelos instaladores) e avisa
quando há versão nova, com link de download do instalador certo para o SO.
A aplicação da atualização é manual: rodar o instalador novo por cima
(banco, `.env` e gravações são preservados nos dois SOs).

## Acesso remoto às câmeras (opcional)

Depois de instalado: **Admin → Configurações → Acesso via nuvem** — informe o
código do cliente e a chave de ativação fornecida pela Onlitec. Detalhes em
`deploy/cloud/README.md`.

## Como sai uma release (para quem mantém)

```bash
# 1. versão única no package.json raiz
npm version 2.3.0 --no-git-tag-version   # ou editar à mão
git commit -am "chore: v2.3.0"
# 2. tag anotada (a mensagem vira as notas do latest.json)
git tag -a v2.3.0 -m "Notas da versão"
git push && git push --tags
# 3. a CI compila o .exe (runner Windows) e o .tar.gz (runner Ubuntu),
#    valida tag == package.json e publica em cloud.onlitec.com.br/downloads/
```
