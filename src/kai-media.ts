export type KaiMediaCategory = 'image' | 'audio' | 'video' | 'pdf' | 'text' | 'unsupported'

export interface KaiMediaAttachment {
  id?: string
  filename?: string
  content_type?: string
  size?: number
  url?: string
  proxy_url?: string
  width?: number
  height?: number
  duration_secs?: number
}

export interface KaiSafeAttachment {
  id?: string
  filename?: string
  content_type?: string
  size?: number
  width?: number
  height?: number
  duration_secs?: number
  category: KaiMediaCategory
}

export interface KaiPreparedMedia {
  attachment: KaiSafeAttachment
  category: Exclude<KaiMediaCategory, 'unsupported'>
  byte_length: number
  page_count?: number
  text_content?: string
  content_part: Record<string, unknown>
}

export interface KaiValidatedGeneratedImage {
  mime_type: 'image/png' | 'image/jpeg' | 'image/webp'
  data_url: string
  byte_length: number
}

export type KaiMediaPreparation =
  | { ok: true; prepared: KaiPreparedMedia }
  | { ok: false; attachment: KaiSafeAttachment; error: string }

export const MAX_KAI_MEDIA_ATTACHMENTS = 4
export const MAX_KAI_MEDIA_TOTAL_BYTES = 12 * 1024 * 1024
export const MAX_KAI_AUDIO_DURATION_SECONDS = 10 * 60
export const MAX_KAI_VIDEO_DURATION_SECONDS = 3 * 60
export const MAX_KAI_PDF_PAGES = 50
export const MAX_KAI_IMAGE_DIMENSION = 16_384
export const MAX_KAI_IMAGE_PIXELS = 40_000_000

export const KAI_MEDIA_LIMITS: Readonly<Record<Exclude<KaiMediaCategory, 'unsupported'>, number>> = {
  image: 6 * 1024 * 1024,
  audio: 8 * 1024 * 1024,
  video: 12 * 1024 * 1024,
  pdf: 8 * 1024 * 1024,
  text: 256 * 1024,
}

const DISCORD_MEDIA_HOSTS = new Set([
  'cdn.discordapp.com',
  'media.discordapp.net',
])

const EXTENSIONS: Record<string, { category: KaiMediaCategory; mime: string; format?: string }> = {
  png: { category: 'image', mime: 'image/png' },
  jpg: { category: 'image', mime: 'image/jpeg' },
  jpeg: { category: 'image', mime: 'image/jpeg' },
  webp: { category: 'image', mime: 'image/webp' },
  gif: { category: 'image', mime: 'image/gif' },
  wav: { category: 'audio', mime: 'audio/wav', format: 'wav' },
  mp3: { category: 'audio', mime: 'audio/mpeg', format: 'mp3' },
  aiff: { category: 'audio', mime: 'audio/aiff', format: 'aiff' },
  aif: { category: 'audio', mime: 'audio/aiff', format: 'aiff' },
  aac: { category: 'audio', mime: 'audio/aac', format: 'aac' },
  ogg: { category: 'audio', mime: 'audio/ogg', format: 'ogg' },
  opus: { category: 'audio', mime: 'audio/opus', format: 'opus' },
  flac: { category: 'audio', mime: 'audio/flac', format: 'flac' },
  m4a: { category: 'audio', mime: 'audio/m4a', format: 'm4a' },
  mp4: { category: 'video', mime: 'video/mp4' },
  mov: { category: 'video', mime: 'video/quicktime' },
  mpeg: { category: 'video', mime: 'video/mpeg' },
  mpg: { category: 'video', mime: 'video/mpeg' },
  webm: { category: 'video', mime: 'video/webm' },
  pdf: { category: 'pdf', mime: 'application/pdf' },
  txt: { category: 'text', mime: 'text/plain' },
  md: { category: 'text', mime: 'text/markdown' },
  markdown: { category: 'text', mime: 'text/markdown' },
}

function extensionOf(filename: string | undefined): string {
  const match = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/)
  return match?.[1] || ''
}

function categoryFromMime(contentType: string | undefined): KaiMediaCategory {
  const mime = String(contentType || '').split(';', 1)[0].trim().toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'text/plain' || mime === 'text/markdown' || mime === 'text/x-markdown') return 'text'
  return 'unsupported'
}

export function classifyKaiMediaAttachment(attachment: KaiMediaAttachment): KaiMediaCategory {
  const fromMime = categoryFromMime(attachment.content_type)
  const ext = EXTENSIONS[extensionOf(attachment.filename)]
  if (fromMime !== 'unsupported') return fromMime
  return ext?.category || 'unsupported'
}

export function safeKaiFilename(value: string | undefined, fallback = 'attachment'): string {
  const cleaned = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '_')
    .trim()
    .slice(0, 120)
  return cleaned || fallback
}

export function sanitizeKaiAttachment(attachment: KaiMediaAttachment): KaiSafeAttachment {
  return {
    ...(attachment.id ? { id: String(attachment.id).slice(0, 120) } : {}),
    filename: safeKaiFilename(attachment.filename),
    ...(attachment.content_type ? { content_type: String(attachment.content_type).slice(0, 120) } : {}),
    ...(Number.isFinite(attachment.size) ? { size: Math.max(0, Math.trunc(attachment.size!)) } : {}),
    ...(Number.isFinite(attachment.width) ? { width: Math.max(0, Math.trunc(attachment.width!)) } : {}),
    ...(Number.isFinite(attachment.height) ? { height: Math.max(0, Math.trunc(attachment.height!)) } : {}),
    ...(Number.isFinite(attachment.duration_secs) ? { duration_secs: Math.max(0, Number(attachment.duration_secs)) } : {}),
    category: classifyKaiMediaAttachment(attachment),
  }
}

export function isTrustedDiscordMediaUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false
  try {
    const url = new URL(rawUrl)
    const trustedPath = url.pathname.startsWith('/attachments/') || url.pathname.startsWith('/ephemeral-attachments/')
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.port
      && DISCORD_MEDIA_HOSTS.has(url.hostname.toLowerCase())
      && trustedPath
  } catch {
    return false
  }
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length))
}

function u16be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] || 0) << 8) | (bytes[offset + 1] || 0)
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] || 0) * 0x1000000)
    + ((bytes[offset + 1] || 0) << 16)
    + ((bytes[offset + 2] || 0) << 8)
    + (bytes[offset + 3] || 0)) >>> 0
}

function u32le(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset + 3] || 0) * 0x1000000)
    + ((bytes[offset + 2] || 0) << 16)
    + ((bytes[offset + 1] || 0) << 8)
    + (bytes[offset] || 0)) >>> 0
}

function validatedImageDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  let width = 0
  let height = 0
  if (mime === 'image/png') {
    if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null
    width = u32be(bytes, 16)
    height = u32be(bytes, 20)
  } else if (mime === 'image/jpeg') {
    let offset = 2
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) return null
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
      const marker = bytes[offset++]
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 2 > bytes.length) return null
      const segmentLength = u16be(bytes, offset)
      if (segmentLength < 2 || offset + segmentLength > bytes.length) return null
      const isSof = (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      if (isSof) {
        if (segmentLength < 7) return null
        height = u16be(bytes, offset + 3)
        width = u16be(bytes, offset + 5)
        break
      }
      offset += segmentLength
    }
  } else if (mime === 'image/webp') {
    if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null
    const chunk = ascii(bytes, 12, 4)
    if (chunk === 'VP8X') {
      width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16))
      height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
    } else if (chunk === 'VP8 ' && bytes.length >= 30 && startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) {
      width = (bytes[26] | (bytes[27] << 8)) & 0x3fff
      height = (bytes[28] | (bytes[29] << 8)) & 0x3fff
    } else if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const bits = u32le(bytes, 21)
      width = 1 + (bits & 0x3fff)
      height = 1 + ((bits >>> 14) & 0x3fff)
    }
  }
  if (!width || !height || width > MAX_KAI_IMAGE_DIMENSION || height > MAX_KAI_IMAGE_DIMENSION) return null
  if (width * height > MAX_KAI_IMAGE_PIXELS) return null
  return { width, height }
}

function wavDurationSeconds(bytes: Uint8Array): number | null {
  if (bytes.length < 44 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') return null
  let offset = 12
  let byteRate = 0
  let dataSize = -1
  while (offset + 8 <= bytes.length) {
    const chunkType = ascii(bytes, offset, 4)
    const chunkSize = u32le(bytes, offset + 4)
    const payload = offset + 8
    if (chunkSize > bytes.length - payload) return null
    if (chunkType === 'fmt ') {
      if (chunkSize < 16) return null
      byteRate = u32le(bytes, payload + 8)
    } else if (chunkType === 'data') {
      dataSize = chunkSize
    }
    offset = payload + chunkSize + (chunkSize % 2)
  }
  if (!byteRate || dataSize < 0) return null
  const duration = dataSize / byteRate
  return Number.isFinite(duration) && duration > 0 ? duration : null
}

function mp3DurationSeconds(bytes: Uint8Array): number | null {
  let offset = 0
  if (ascii(bytes, 0, 3) === 'ID3' && bytes.length >= 10) {
    const tagSize = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)
    offset = 10 + tagSize
  }
  let seconds = 0
  let frameCount = 0
  while (offset + 4 <= bytes.length) {
    if (bytes.length - offset === 128 && ascii(bytes, offset, 3) === 'TAG') break
    const header = u32be(bytes, offset)
    if (((header & 0xffe00000) >>> 0) !== 0xffe00000) return null
    const versionBits = (header >>> 19) & 0x3
    const layerBits = (header >>> 17) & 0x3
    const bitrateIndex = (header >>> 12) & 0xf
    const sampleRateIndex = (header >>> 10) & 0x3
    const padding = (header >>> 9) & 1
    if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null
    const version = versionBits === 3 ? 1 : (versionBits === 2 ? 2 : 2.5)
    const bitrateTable = version === 1
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
    const sampleRates = version === 1 ? [44100, 48000, 32000] : (version === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000])
    const bitrate = bitrateTable[bitrateIndex] * 1000
    const sampleRate = sampleRates[sampleRateIndex]
    const samples = version === 1 ? 1152 : 576
    const frameLength = Math.floor((version === 1 ? 144 : 72) * bitrate / sampleRate) + padding
    if (frameLength < 4 || offset + frameLength > bytes.length) return null
    seconds += samples / sampleRate
    frameCount += 1
    offset += frameLength
  }
  return frameCount > 0 && offset === bytes.length ? seconds : null
}

function adtsDurationSeconds(bytes: Uint8Array): number | null {
  let offset = 0
  let seconds = 0
  let frames = 0
  const sampleRates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]
  while (offset + 7 <= bytes.length) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xf6) !== 0xf0) return null
    const sampleRate = sampleRates[(bytes[offset + 2] >>> 2) & 0xf]
    const frameLength = ((bytes[offset + 3] & 0x3) << 11) | (bytes[offset + 4] << 3) | (bytes[offset + 5] >>> 5)
    const rawBlocks = bytes[offset + 6] & 0x3
    if (!sampleRate || frameLength < 7 || offset + frameLength > bytes.length) return null
    seconds += (1024 * (rawBlocks + 1)) / sampleRate
    frames += 1
    offset += frameLength
  }
  return frames > 0 && offset === bytes.length ? seconds : null
}

function oggOpusDurationSeconds(bytes: Uint8Array): number | null {
  let offset = 0
  let preSkip: number | null = null
  let finalGranule: bigint | null = null
  let pages = 0
  while (offset + 27 <= bytes.length) {
    if (ascii(bytes, offset, 4) !== 'OggS' || bytes[offset + 4] !== 0) return null
    const segments = bytes[offset + 26]
    if (offset + 27 + segments > bytes.length) return null
    let payloadLength = 0
    for (let index = 0; index < segments; index += 1) payloadLength += bytes[offset + 27 + index]
    const payload = offset + 27 + segments
    if (payload + payloadLength > bytes.length) return null
    let granule = 0n
    for (let index = 7; index >= 0; index -= 1) granule = (granule << 8n) | BigInt(bytes[offset + 6 + index])
    if (granule !== 0xffffffffffffffffn) finalGranule = granule
    if (preSkip === null && payloadLength >= 12 && ascii(bytes, payload, 8) === 'OpusHead') {
      preSkip = bytes[payload + 10] | (bytes[payload + 11] << 8)
    }
    pages += 1
    offset = payload + payloadLength
  }
  if (!pages || offset !== bytes.length || preSkip === null || finalGranule === null || finalGranule <= BigInt(preSkip)) return null
  const seconds = Number(finalGranule - BigInt(preSkip)) / 48000
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

function flacDurationSeconds(bytes: Uint8Array): number | null {
  if (bytes.length < 42 || ascii(bytes, 0, 4) !== 'fLaC') return null
  const type = bytes[4] & 0x7f
  const length = (bytes[5] << 16) | (bytes[6] << 8) | bytes[7]
  if (type !== 0 || length !== 34 || bytes.length < 8 + length) return null
  let packed = 0n
  for (let index = 18; index < 26; index += 1) packed = (packed << 8n) | BigInt(bytes[index])
  const sampleRate = Number((packed >> 44n) & 0xfffffn)
  const totalSamples = Number(packed & 0xfffffffffn)
  const seconds = totalSamples / sampleRate
  return sampleRate > 0 && totalSamples > 0 && Number.isFinite(seconds) ? seconds : null
}

function extended80(bytes: Uint8Array, offset: number): number | null {
  if (offset + 10 > bytes.length) return null
  const exponentWord = u16be(bytes, offset)
  const sign = exponentWord & 0x8000 ? -1 : 1
  const exponent = exponentWord & 0x7fff
  let mantissa = 0n
  for (let index = 0; index < 8; index += 1) mantissa = (mantissa << 8n) | BigInt(bytes[offset + 2 + index])
  if (!exponent || !mantissa) return null
  return sign * Number(mantissa) * Math.pow(2, exponent - 16383 - 63)
}

function aiffDurationSeconds(bytes: Uint8Array): number | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'FORM' || !['AIFF', 'AIFC'].includes(ascii(bytes, 8, 4))) return null
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4)
    const size = u32be(bytes, offset + 4)
    const payload = offset + 8
    if (size > bytes.length - payload) return null
    if (type === 'COMM') {
      if (size < 18) return null
      const frames = u32be(bytes, payload + 2)
      const rate = extended80(bytes, payload + 8)
      const seconds = rate ? frames / rate : 0
      return frames > 0 && Number.isFinite(seconds) && seconds > 0 ? seconds : null
    }
    offset = payload + size + (size % 2)
  }
  return null
}

function readEbmlSize(bytes: Uint8Array, offset: number): { value: number; length: number } | null {
  if (offset >= bytes.length || bytes[offset] === 0) return null
  let length = 1
  let mask = 0x80
  while (length <= 8 && !(bytes[offset] & mask)) {
    length += 1
    mask >>= 1
  }
  if (length > 8 || offset + length > bytes.length) return null
  let value = bytes[offset] & (mask - 1)
  for (let index = 1; index < length; index += 1) value = value * 256 + bytes[offset + index]
  return Number.isSafeInteger(value) ? { value, length } : null
}

function webmDurationSeconds(bytes: Uint8Array): number | null {
  if (!startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return null
  const findElement = (signature: number[]): Uint8Array | null => {
    for (let offset = 0; offset <= bytes.length - signature.length - 1; offset += 1) {
      if (!startsWith(bytes, signature, offset)) continue
      const size = readEbmlSize(bytes, offset + signature.length)
      if (!size) continue
      const start = offset + signature.length + size.length
      if (size.value > 0 && start + size.value <= bytes.length) return bytes.subarray(start, start + size.value)
    }
    return null
  }
  const scaleBytes = findElement([0x2a, 0xd7, 0xb1])
  const durationBytes = findElement([0x44, 0x89])
  let scale = 1_000_000
  if (scaleBytes) {
    if (scaleBytes.length > 8) return null
    scale = 0
    for (const byte of scaleBytes) scale = scale * 256 + byte
  }
  if (!durationBytes || ![4, 8].includes(durationBytes.length) || !scale) return null
  const view = new DataView(durationBytes.buffer, durationBytes.byteOffset, durationBytes.byteLength)
  const durationUnits = durationBytes.length === 4 ? view.getFloat32(0, false) : view.getFloat64(0, false)
  const seconds = durationUnits * scale / 1_000_000_000
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

function mp4DurationSeconds(bytes: Uint8Array): number | null {
  const containers = new Set(['moov'])
  let found: number | null = null
  const walk = (start: number, end: number, depth: number): boolean => {
    if (depth > 2) return false
    let offset = start
    while (offset + 8 <= end) {
      let size = u32be(bytes, offset)
      const type = ascii(bytes, offset + 4, 4)
      let header = 8
      if (size === 1) {
        if (offset + 16 > end) return false
        const high = u32be(bytes, offset + 8)
        const low = u32be(bytes, offset + 12)
        if (high !== 0) return false
        size = low
        header = 16
      } else if (size === 0) {
        size = end - offset
      }
      if (size < header || offset + size > end) return false
      if (type === 'mvhd') {
        const payload = offset + header
        if (payload + 20 > offset + size) return false
        const version = bytes[payload]
        let timescale: number
        let duration: number
        if (version === 0) {
          timescale = u32be(bytes, payload + 12)
          duration = u32be(bytes, payload + 16)
        } else if (version === 1) {
          if (payload + 32 > offset + size) return false
          timescale = u32be(bytes, payload + 20)
          const high = u32be(bytes, payload + 24)
          if (high !== 0) return false
          duration = u32be(bytes, payload + 28)
        } else return false
        const seconds = duration / timescale
        if (!timescale || !Number.isFinite(seconds) || seconds <= 0) return false
        found = seconds
      } else if (containers.has(type) && !walk(offset + header, offset + size, depth + 1)) {
        return false
      }
      offset += size
    }
    return offset === end
  }
  return walk(0, bytes.length, 0) ? found : null
}

function verifiedMediaDuration(bytes: Uint8Array, mime: string): number | null {
  if (mime === 'audio/wav') return wavDurationSeconds(bytes)
  if (mime === 'audio/mpeg') return mp3DurationSeconds(bytes)
  if (mime === 'audio/aac') return adtsDurationSeconds(bytes)
  if (mime === 'audio/opus') return oggOpusDurationSeconds(bytes)
  if (mime === 'audio/flac') return flacDurationSeconds(bytes)
  if (mime === 'audio/aiff') return aiffDurationSeconds(bytes)
  if (mime === 'audio/m4a' || mime === 'video/mp4' || mime === 'video/quicktime') return mp4DurationSeconds(bytes)
  if (mime === 'video/webm') return webmDurationSeconds(bytes)
  return null
}

function sniffMedia(bytes: Uint8Array, declared: KaiMediaCategory, filename: string): { category: KaiMediaCategory; mime: string; format?: string } | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { category: 'image', mime: 'image/png' }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { category: 'image', mime: 'image/jpeg' }
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return { category: 'image', mime: 'image/gif' }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return { category: 'image', mime: 'image/webp' }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return { category: 'audio', mime: 'audio/wav', format: 'wav' }
  if (ascii(bytes, 0, 4) === 'FORM' && (ascii(bytes, 8, 4) === 'AIFF' || ascii(bytes, 8, 4) === 'AIFC')) return { category: 'audio', mime: 'audio/aiff', format: 'aiff' }
  if (ascii(bytes, 0, 4) === 'fLaC') return { category: 'audio', mime: 'audio/flac', format: 'flac' }
  if (ascii(bytes, 0, 4) === 'OggS') {
    const opus = ascii(bytes, 28, 8) === 'OpusHead' || new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 96))).includes('OpusHead')
    return { category: 'audio', mime: opus ? 'audio/opus' : 'audio/ogg', format: opus ? 'opus' : 'ogg' }
  }
  if (bytes[0] === 0xff && (bytes[1] === 0xf1 || bytes[1] === 0xf9)) return { category: 'audio', mime: 'audio/aac', format: 'aac' }
  if (ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return { category: 'audio', mime: 'audio/mpeg', format: 'mp3' }
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const ext = extensionOf(filename)
    if (declared === 'audio' || ext === 'm4a') return { category: 'audio', mime: 'audio/m4a', format: 'm4a' }
    return { category: 'video', mime: ext === 'mov' ? 'video/quicktime' : 'video/mp4' }
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { category: 'video', mime: 'video/webm' }
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0xba]) || startsWith(bytes, [0x00, 0x00, 0x01, 0xb3])) return { category: 'video', mime: 'video/mpeg' }
  if (ascii(bytes, 0, 5) === '%PDF-') return { category: 'pdf', mime: 'application/pdf' }
  if (declared === 'text') {
    const sample = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes.subarray(0, Math.min(bytes.length, 8192)))
    if (!sample.includes('\u0000')) return { category: 'text', mime: EXTENSIONS[extensionOf(filename)]?.mime || 'text/plain' }
  }
  return null
}

async function readBoundedBody(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        await reader.cancel('bounded media limit exceeded')
        throw new Error(`attachment exceeds ${limit} byte limit`)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

function toBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function verifiedPdfPageCount(bytes: Uint8Array): number | undefined {
  const text = new TextDecoder('latin1').decode(bytes)
  if (!/%%EOF\s*$/.test(text)) return undefined
  // PDF comments are token separators, and names may use #xx escapes. Normalize
  // both before counting semantic /Type /Page dictionary entries. Object streams
  // remain rejected above because lexical inspection cannot safely traverse them.
  const withoutComments = text.replace(/%[^\r\n]*(?:\r\n|\r|\n|$)/g, ' ')
  const normalizedNames = withoutComments.replace(/\/((?:#[0-9a-fA-F]{2}|[^\s<>\[\](){}/%])+)/g, (_match, name: string) => {
    return `/${name.replace(/#([0-9a-fA-F]{2})/g, (_escape, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))}`
  })
  if (/\/ObjStm\b|\/Type\s*\/XRef\b|\/Encrypt\b/.test(normalizedNames)) return undefined
  const count = (normalizedNames.match(/\/Type\s*\/Page\b/g) || []).length
  return count || undefined
}

function formatFromMime(mime: string, fallback?: string): string {
  const value = mime.toLowerCase()
  if (value.includes('mpeg') || value.includes('mp3')) return 'mp3'
  if (value.includes('wav')) return 'wav'
  if (value.includes('aiff')) return 'aiff'
  if (value.includes('aac')) return 'aac'
  if (value.includes('opus')) return 'opus'
  if (value.includes('ogg')) return 'ogg'
  if (value.includes('flac')) return 'flac'
  if (value.includes('m4a') || value.includes('mp4')) return 'm4a'
  return fallback || 'wav'
}

export async function prepareKaiMediaAttachment(
  attachment: KaiMediaAttachment,
  fetcher: typeof fetch = fetch,
  timeoutMs = 10_000,
  trustedMetadata = false,
): Promise<KaiMediaPreparation> {
  const safe = sanitizeKaiAttachment(attachment)
  const category = safe.category
  if (category === 'unsupported') {
    const ext = extensionOf(safe.filename)
    const office = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf'].includes(ext)
    return { ok: false, attachment: safe, error: office ? 'Office document rejected: no reviewed safe extraction/conversion path is configured' : 'Unsupported attachment type' }
  }
  const limit = KAI_MEDIA_LIMITS[category]
  if ((safe.size || 0) > limit) return { ok: false, attachment: safe, error: `${category} attachment exceeds ${limit} byte limit` }
  if (category === 'audio' && (safe.duration_secs || 0) > MAX_KAI_AUDIO_DURATION_SECONDS) {
    return { ok: false, attachment: safe, error: `audio duration exceeds ${MAX_KAI_AUDIO_DURATION_SECONDS} second limit` }
  }
  if (category === 'video' && (safe.duration_secs || 0) > MAX_KAI_VIDEO_DURATION_SECONDS) {
    return { ok: false, attachment: safe, error: `video duration exceeds ${MAX_KAI_VIDEO_DURATION_SECONDS} second limit` }
  }
  const rawUrl = attachment.url || attachment.proxy_url
  if (!isTrustedDiscordMediaUrl(rawUrl)) return { ok: false, attachment: safe, error: 'Attachment URL is not an allowlisted Discord media URL' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('media timeout'), Math.max(1, timeoutMs))
  try {
    const response = await fetcher(rawUrl!, {
      signal: controller.signal,
      redirect: 'manual',
      headers: { Accept: '*/*' },
    })
    if (response.status >= 300 && response.status < 400) return { ok: false, attachment: safe, error: 'Discord media redirect was rejected' }
    if (!response.ok) return { ok: false, attachment: safe, error: `Discord media fetch failed with status ${response.status}` }
    const contentLength = Number(response.headers.get('Content-Length') || 0)
    if (Number.isFinite(contentLength) && contentLength > limit) return { ok: false, attachment: safe, error: `${category} attachment exceeds ${limit} byte limit` }
    const bytes = await readBoundedBody(response, limit)
    if (!bytes.byteLength) return { ok: false, attachment: safe, error: 'Discord media response was empty' }
    const detected = sniffMedia(bytes, category, safe.filename || 'attachment')
    if (!detected || detected.category !== category) return { ok: false, attachment: safe, error: 'Attachment MIME/signature validation failed' }
    if (detected.mime === 'image/gif') return { ok: false, attachment: safe, error: 'GIF rejected: no reviewed bounded still-frame extraction path is configured' }
    const responseCategory = categoryFromMime(response.headers.get('Content-Type') || undefined)
    if (responseCategory !== 'unsupported' && responseCategory !== category) return { ok: false, attachment: safe, error: 'Attachment response MIME disagrees with its validated media category' }

    let verifiedDuration: number | undefined
    let dimensions: { width: number; height: number } | undefined
    if (category === 'image') {
      dimensions = validatedImageDimensions(bytes, detected.mime) || undefined
      if (!dimensions) return { ok: false, attachment: safe, error: 'Image dimensions are unverifiable or exceed bounded dimension/pixel limits' }
    }
    if (category === 'audio' || category === 'video') {
      verifiedDuration = verifiedMediaDuration(bytes, detected.mime) || undefined
      if (!verifiedDuration && trustedMetadata && safe.duration_secs && safe.duration_secs > 0) verifiedDuration = safe.duration_secs
      if (!verifiedDuration) return { ok: false, attachment: safe, error: `${category} duration could not be verified from the media container` }
      const durationLimit = category === 'audio' ? MAX_KAI_AUDIO_DURATION_SECONDS : MAX_KAI_VIDEO_DURATION_SECONDS
      if (verifiedDuration > durationLimit) return { ok: false, attachment: safe, error: `${category} duration exceeds ${durationLimit} second limit` }
    }

    const base64 = toBase64(bytes)
    let pageCount: number | undefined
    let contentPart: Record<string, unknown>
    let textContent: string | undefined
    if (category === 'image') {
      contentPart = { type: 'image_url', image_url: { url: `data:${detected.mime};base64,${base64}` } }
    } else if (category === 'audio') {
      contentPart = { type: 'input_audio', input_audio: { data: base64, format: detected.format || formatFromMime(detected.mime) } }
    } else if (category === 'video') {
      contentPart = { type: 'video_url', video_url: { url: `data:${detected.mime};base64,${base64}` } }
    } else if (category === 'pdf') {
      pageCount = verifiedPdfPageCount(bytes)
      if (!pageCount) return { ok: false, attachment: safe, error: 'PDF page count is unverifiable or uses compressed/object-stream structures' }
      if (pageCount > MAX_KAI_PDF_PAGES) return { ok: false, attachment: safe, error: `PDF exceeds ${MAX_KAI_PDF_PAGES} page limit` }
      contentPart = { type: 'file', file: { filename: safe.filename, file_data: `data:application/pdf;base64,${base64}` } }
    } else {
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
      if (text.includes('\u0000')) return { ok: false, attachment: safe, error: 'Text attachment contains binary data' }
      textContent = text
      contentPart = { type: 'text', text: `[Untrusted text attachment ${safe.filename}]\n${text.slice(0, KAI_MEDIA_LIMITS.text)}` }
    }
    return {
      ok: true,
      prepared: {
        attachment: {
          ...safe,
          content_type: detected.mime,
          size: bytes.byteLength,
          ...(dimensions || {}),
          ...(verifiedDuration ? { duration_secs: verifiedDuration } : {}),
        },
        category,
        byte_length: bytes.byteLength,
        ...(pageCount ? { page_count: pageCount } : {}),
        ...(textContent !== undefined ? { text_content: textContent } : {}),
        content_part: contentPart,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, attachment: safe, error: /abort|timeout/i.test(message) ? `Discord media fetch timed out after ${timeoutMs}ms` : message.slice(0, 240) }
  } finally {
    clearTimeout(timer)
  }
}

export function validateKaiGeneratedImage(base64: string, declaredMime?: string): KaiValidatedGeneratedImage | null {
  if (!base64 || base64.length > 24 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(base64)) return null
  let binary: string
  try {
    binary = atob(base64)
  } catch {
    return null
  }
  if (!binary || binary.length > 16 * 1024 * 1024) return null
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = binary.charCodeAt(index)
  const prefix = bytes.subarray(0, Math.min(bytes.length, 16))
  let detected: KaiValidatedGeneratedImage['mime_type'] | null = null
  if (startsWith(prefix, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) detected = 'image/png'
  else if (startsWith(prefix, [0xff, 0xd8, 0xff])) detected = 'image/jpeg'
  else if (ascii(prefix, 0, 4) === 'RIFF' && ascii(prefix, 8, 4) === 'WEBP') detected = 'image/webp'
  if (!detected) return null
  if (!validatedImageDimensions(bytes, detected)) return null
  const normalizedDeclared = String(declaredMime || detected).toLowerCase() === 'image/jpg' ? 'image/jpeg' : String(declaredMime || detected).toLowerCase()
  if (normalizedDeclared !== detected) return null
  return { mime_type: detected, data_url: `data:${detected};base64,${base64}`, byte_length: binary.length }
}
