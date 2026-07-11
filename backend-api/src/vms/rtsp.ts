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

  if (device.protocol === 'hikvision_isapi') {
    // Convenção Hikvision: canal N → stream N01 (main) / N02 (sub)
    const cred = `${encodeURIComponent(device.username)}:${encodeURIComponent(device.password)}`;
    const base = `rtsp://${cred}@${device.ip}:${device.rtspPort}/Streaming/Channels/`;
    return {
      main: `${base}${channel.channelNo}01`,
      sub: `${base}${channel.channelNo}02`,
    };
  }

  // onvif/rtsp genérico: sem URL manual não há como conectar
  return { main: null, sub: channel.rtspUrlSub || null };
}

/** Nome do path secundário (sub-stream) no MediaMTX. */
export function subPathName(streamPath: string): string {
  return `${streamPath}-sub`;
}
