Implemente um Discovery Engine completo.



Este serviço será responsável por localizar automaticamente dispositivos IP na rede local.



Criar uma arquitetura baseada em plugins.



DiscoveryManager



Responsável por executar diversos scanners em paralelo.



Criar scanners independentes:



PingScanner

ArpScanner

OnvifScanner

WsDiscoveryScanner

SSDPScanner

MDNSScanner

SnmpScanner

HikvisionDiscoveryScanner

DahuaDiscoveryScanner

IntelbrasScanner

NiceScanner (stub)

ControlIDScanner

SupremaScanner

ZKTecoScanner



Cada scanner deverá retornar um objeto padronizado.



interface DiscoveryDevice {



ip



mac



manufacturer



model



serial



firmware



hostname



ports



category



protocol



online



}



O DiscoveryManager deverá unificar os resultados removendo dispositivos duplicados.



A identificação deverá considerar:



MAC

Serial

Hostname

Modelo



Criar API



GET /api/discovery/start



GET /api/discovery/results



GET /api/discovery/status



POST /api/discovery/stop



Toda a descoberta deve ocorrer em background.



O frontend apenas acompanha o progresso em tempo real.

