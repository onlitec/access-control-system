interface DeviceLike {
  protocol: string;
  ip: string;
  rtspPort: number;
  username: string;
  password: string;
}

interface ChannelLike {
  channelNo: number;
  rtspUrlMain: string | null;
  rtspUrlSub: string | null;
}

/**
 * Monta as URLs RTSP (main e sub-stream) de um canal. Overrides manuais
 * (rtsp_url_main/rtsp_url_sub) sempre vencem — é o fallback universal para
 * câmeras ONVIF/RTSP genéricas cuja URL não dá para derivar.
 */
export function buildStreamUrls(device: DeviceLike, channel: ChannelLike): { main: string | null; sub: string | null } {
  if (channel.rtspUrlMain) {
    return { main: channel.rtspUrlMain, sub: channel.rtspUrlSub || null };
  }

  const cred = `${encodeURIComponent(device.username)}:${encodeURIComponent(device.password)}`;

  if (device.protocol === 'hikvision_isapi') {
    // Convenção Hikvision: canal N → stream N01 (main) / N02 (sub)
    const base = `rtsp://${cred}@${device.ip}:${device.rtspPort}/Streaming/Channels/`;
    return {
      main: `${base}${channel.channelNo}01`,
      sub: `${base}${channel.channelNo}02`,
    };
  }

  if (device.protocol === 'xiongmai') {
    // DVRs/HVRs da plataforma Xiongmai/XMeye (Giga Security, Multilaser e outros
    // OEMs; reconhecíveis pelo `Server: uc-httpd` e pela porta 34567). A URL leva
    // as credenciais TAMBÉM na query string — validado num HVR GS08HVR real.
    // stream=0 é o main; stream=1 o sub.
    const base = `rtsp://${cred}@${device.ip}:${device.rtspPort}/user=${device.username}&password=${device.password}&channel=${channel.channelNo}`;
    return {
      main: `${base}&stream=0.sdp?real_stream`,
      sub: `${base}&stream=1.sdp?real_stream`,
    };
  }

  if (device.protocol === 'dahua') {
    // Convenção Dahua/Intelbras: subtype 0 = main, 1 = sub
    const base = `rtsp://${cred}@${device.ip}:${device.rtspPort}/cam/realmonitor?channel=${channel.channelNo}`;
    return {
      main: `${base}&subtype=0`,
      sub: `${base}&subtype=1`,
    };
  }

  // onvif/rtsp genérico: sem URL manual não há como conectar
  return { main: null, sub: channel.rtspUrlSub || null };
}

/** Nome do path secundário (sub-stream) no MediaMTX. */
export function subPathName(streamPath: string): string {
  return `${streamPath}-sub`;
}
