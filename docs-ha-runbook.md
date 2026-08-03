# Runbook: failover do tenant "onlitec" (cloud.onlitec.com.br)

## Topologia
- **Primário**: este servidor (ONLI-ACESSO), Postgres 14 nativo, IP LAN
  `172.20.120.48`, Tailscale `100.107.189.31`.
- **Standby**: VM nova, Postgres 14 em Docker (réplica de leitura), IP LAN
  `172.20.120.52` (DHCP — já mudou uma vez após reboot para aumentar memória;
  o roteamento no relayserver usa o Tailscale `100.126.142.65`, estável,
  então isso não quebra o failover), Tailscale `100.126.142.65`.
  A liberação de replicação no `pg_hba.conf` do primário é para a faixa
  `172.20.120.0/24` (não um IP fixo), exatamente por causa dessa instabilidade
  do DHCP — se o range da LAN mudar, ajustar lá.
- **Roteamento**: `relayserver` (100.72.185.126, IP público fixo
  `200.100.255.172`) recebe `cloud.onlitec.com.br` via Cloudflare Tunnel e
  encaminha `/t/onlitec/{api,hls}` para os dois servidores acima via upstreams
  nginx com failover passivo (`backup`), configurados em
  `/home/alfreire/docker/proxy/data/nginx/custom/http.conf` (container
  `nginx-proxy-manager`).
- **O que sobrevive à queda do primário**: visualização de câmeras ao vivo
  (MediaMTX + `PathReconciler`, somente leitura) e a API para leitura/escrita
  (escrita é encaminhada de volta ao primário pelo middleware
  `standbyForwardMiddleware` — só funciona se o primário ainda responder pela
  rede interna; se o primário estiver TOTALMENTE fora do ar, escritas falham
  até a promoção manual abaixo).
- **O que NÃO roda no standby por padrão**: gravação, indexação de segmentos,
  upload para nuvem, retenção e VCA (analytics) — ver
  `backend-api/src/vms/vms-main.ts`, gated por `isStandby()`. Evita duplicar
  gravação/eventos nos dois servidores ao mesmo tempo.

## Failover (primário caiu de verdade)

1. **Confirmar que o primário está mesmo fora** (não é só uma reinicialização
   rápida) — o nginx do relayserver já desvia sozinho para o standby depois de
   2 falhas (`max_fails=2 fail_timeout=10s`), então a visualização de câmeras
   e leituras da API já devem estar funcionando via standby automaticamente.
2. **Promover o standby a primário** (só quando tiver certeza de que o antigo
   primário não vai voltar a escrever nos mesmos dados ao mesmo tempo — evita
   split-brain):
   ```
   ssh alfreire@172.20.120.51
   sudo docker exec onliacesso-postgres psql -U onliacesso -c "SELECT pg_promote();"
   ```
3. **Reiniciar os serviços de VMS/escrita completos no standby promovido**
   (para ele passar a rodar gravação/indexação/upload/retenção/VCA também):
   ```
   sudo systemctl restart onliacesso-vms
   ```
   (o `isStandby()` é reavaliado no boot do processo; como o Postgres local já
   não estará mais em recovery, ele volta a rodar como primário completo.)
4. **Remover `PRIMARY_INTERNAL_URL`** do `.env` do servidor promovido (não
   tem mais para onde encaminhar escrita — ele é o primário agora):
   ```
   sudo sed -i '/^PRIMARY_INTERNAL_URL=/d' /opt/onliacesso/config/.env
   sudo systemctl restart onliacesso-api
   ```
5. Opcional: ajustar o `upstream` no relayserver para priorizar o novo
   primário (trocar qual entrada tem `backup`), se a queda for definitiva.

## Failback (servidor antigo volta)

**Nunca ligue os dois como primário ao mesmo tempo** — isso é split-brain e
corrompe os dados. Ao trazer o servidor antigo de volta:

1. Pare o Postgres antigo e **refaça um `pg_basebackup` do zero** a partir do
   servidor que está primário agora (o antigo perdeu o histórico de WAL
   enquanto esteve fora):
   ```
   sudo systemctl stop onliacesso-api onliacesso-vms
   sudo systemctl stop postgresql   # ou docker stop, conforme onde ele rodar
   # mover/apagar o data dir antigo, refazer pg_basebackup -R a partir do novo primário
   ```
2. Suba-o como standby (mesmo processo usado para provisionar a VM nova,
   seção "Provisionar VM nova" no histórico deste projeto).
3. Reative `PRIMARY_INTERNAL_URL` apontando para quem é primário agora.
4. Ajuste o `upstream` do relayserver de volta ao arranjo desejado.

## Teste de failover (não destrutivo vs. destrutivo)

- **Não destrutivo** (já feito): `curl -H "Host: cloud.onlitec.com.br" http://127.0.0.1/t/onlitec/api/health` a partir do relayserver — confirma que a rota chega no primário.
- **Destrutivo** (requer aprovação — derruba brevemente o primário real):
  ```
  sudo systemctl stop onliacesso-api    # neste servidor
  # no relayserver, repetir o curl acima: deve continuar respondendo (200),
  # agora vindo do standby (172.20.120.51 / 100.126.142.65)
  sudo systemctl start onliacesso-api   # restaurar
  ```
