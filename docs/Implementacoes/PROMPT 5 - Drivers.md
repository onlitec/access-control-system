Criar uma arquitetura de Drivers.



Cada fabricante possuirá seu próprio driver.



Drivers



Hikvision



Dahua



Intelbras



Nice



Control ID



Suprema



ZKTeco



ONVIF



Axis



Bosch



Hanwha



Cada driver deverá implementar:



TestConnection()



GetDeviceInfo()



GetCapabilities()



GetUsers()



GetNetwork()



SetNetwork()



GetTime()



SetTime()



GetLogs()



GetFirmware()



Reboot()



FactoryReset()



UpdateFirmware()



BackupConfiguration()



RestoreConfiguration()



CaptureSnapshot()



HealthCheck()



Todos deverão implementar uma interface única DeviceDriver.

