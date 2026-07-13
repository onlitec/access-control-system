# Detecção inteligente por software (VCA)

O OnliAcesso analisa o vídeo **no próprio servidor** (com IA) e gera eventos de
**movimento**, **cruzamento de linha** e **intrusão de área** — mesmo para
câmeras que não têm esse recurso (Yoosee, ONVIF genérico, DVRs). Substitui a
dependência do VCA embarcado (que só existia em câmeras Hikvision).

## Como funciona

Por câmera habilitada, o serviço de vídeo (`onliacesso-vms`) roda:

```
MediaMTX (stream local) → ffmpeg (sub-stream, fps limitado)
  → gate de movimento (barato) → só com movimento: YOLO (onnxruntime)
  → filtra por classe (pessoa/veículo/…) → aplica as regras (zona/linha/área)
  → dispara: gravar + alerta no painel + snapshot + e-mail
```

O **gate de movimento antes da IA** é o que segura a CPU: com a cena parada o
custo é ~0%; a IA só roda quando algo se move. A análise usa o **sub-stream**
(menor) e um teto de análises/seg configurável. É **opt-in por câmera**.

## Como configurar (operador)

**Admin → Câmeras → expandir o dispositivo → botão "Detecção IA"** no canal.
No editor:
- **Desenhe** com o mouse sobre a imagem: zona de movimento / área de intrusão
  (polígonos) e linha de cruzamento (2 pontos, com direção).
- Escolha **o que detectar** (Pessoa, Carro, Moto, Ônibus, Caminhão, Bicicleta).
- Ajuste **sensibilidade**, **análises/seg** (CPU) e **intervalo entre alertas**.
- Por regra, escolha as **ações**: Gravar, Alertar no painel, Snapshot,
  Notificar (e-mail — informe os destinatários).

Os alarmes aparecem no **feed do operador** com a miniatura do momento
(clicável para ampliar).

## Requisitos e custo

- Vem de fábrica com o componente **VMS** dos instaladores (modelo YOLOv8n
  embutido no Windows; baixado no install no Linux). Runtime `onnxruntime-node`
  (CPU, sem GPU) instalado automaticamente.
- **CPU**: cena parada ≈ 0%; sob movimento, ~55 ms por análise por câmera na CPU
  (≈ meio núcleo por câmera ativa a 4 fps). Habilite só nas câmeras que precisam.
- Funciona com qualquer codec (o ffmpeg decodifica H.264/H.265 igual).

## Configuração (env)

Definidas pelos instaladores; ajuste no `.env` do backend se necessário:

| Variável | Efeito |
|---|---|
| `VCA_MODEL_PATH` | caminho do `yolov8n.onnx`. Vazio/ausente = VCA inativo. |
| `VCA_ENABLED` | `false` desliga o motor globalmente (padrão `true`). |
| `FFMPEG_PATH` | ffmpeg usado para puxar os frames. |

Sem o modelo ou sem o `onnxruntime-node`, o backend **degrada graciosamente**
(loga o motivo e segue sem VCA) — nada quebra.
