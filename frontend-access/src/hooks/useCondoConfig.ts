import { useState, useEffect } from 'react';
import {
  getCondominiumSettings,
  getRegistrationRequirements,
  getBlacklist,
  getAccessSchedules,
  getTowersList,
  getUnitsList,
  CondominiumSettings,
  RegistrationRequirement,
  BlacklistRecord,
  AccessSchedule
} from '@/db/api';

export function useCondoConfig() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<CondominiumSettings | null>(null);
  const [requirements, setRequirements] = useState<RegistrationRequirement[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistRecord[]>([]);
  const [schedules, setSchedules] = useState<AccessSchedule[]>([]);
  const [towers, setTowers] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);

  useEffect(() => {
    async function loadConfig() {
      try {
        const [settingsData, reqsData, blacklistData, schedulesData, towersData, unitsData] = await Promise.all([
          getCondominiumSettings(),
          getRegistrationRequirements(),
          getBlacklist(),
          getAccessSchedules(),
          getTowersList(),
          getUnitsList()
        ]);
        setSettings(settingsData);
        setRequirements(reqsData || []);
        setBlacklist(blacklistData || []);
        setSchedules(schedulesData || []);
        setTowers(towersData || []);
        setUnits(unitsData || []);
      } catch (err) {
        console.error('Failed to load condominium configuration in portaria:', err);
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, []);

  const isHorizontal = settings?.type === 'horizontal';

  const labels = {
    tower: isHorizontal ? 'Quadra' : 'Torre',
    towers: isHorizontal ? 'Quadras' : 'Torres',
    block: isHorizontal ? 'Lote' : 'Bloco',
    blocks: isHorizontal ? 'Lotes' : 'Blocos',
    unit: isHorizontal ? 'Residência' : 'Apartamento',
    units: isHorizontal ? 'Residências' : 'Apartamentos',
    floor: isHorizontal ? 'Garagens' : 'Andar',
    garageLabel: isHorizontal ? 'Garagens por residência' : 'Garagens por apartamento'
  };

  // Helper to check if a field is required, optional, or hidden
  const getFieldStatus = (category: string, fieldName: string): 'required' | 'optional' | 'hidden' => {
    const found = requirements.find((r) => r.category === category && r.fieldName === fieldName);
    return found ? found.status : 'optional';
  };

  // Check if a document is blacklisted
  const getBlacklistEntry = (doc: string): BlacklistRecord | undefined => {
    const cleanDoc = doc.replace(/\D/g, '');
    return blacklist.find((b) => b.document.replace(/\D/g, '') === cleanDoc);
  };

  // Check if current time is within allowed schedule
  const isTimeAllowed = (type: 'visitor' | 'provider'): { allowed: boolean; reason?: string } => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 (Domingo) to 6 (Sábado)
    
    const sch = schedules.find((s) => s.type === type && s.dayOfWeek === dayOfWeek);
    if (!sch) return { allowed: true }; // No schedule configured = allowed
    if (!sch.isActive) return { allowed: false, reason: `Acessos bloqueados aos domingos/feriados/dias não permitidos.` };

    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentTimeVal = currentHour * 60 + currentMin;

    const [startH, startM] = sch.startTime.split(':').map(Number);
    const [endH, endM] = sch.endTime.split(':').map(Number);

    const startTimeVal = startH * 60 + startM;
    const endTimeVal = endH * 60 + endM;

    if (currentTimeVal < startTimeVal || currentTimeVal > endTimeVal) {
      return { 
        allowed: false, 
        reason: `Fora do horário permitido (${sch.startTime} às ${sch.endTime}).` 
      };
    }

    return { allowed: true };
  };

  return {
    loading,
    settings,
    requirements,
    blacklist,
    schedules,
    towers,
    units,
    isHorizontal,
    labels,
    getFieldStatus,
    getBlacklistEntry,
    isTimeAllowed
  };
}
