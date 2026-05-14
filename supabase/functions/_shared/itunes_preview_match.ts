export type PreviewInput = {
  trackTitle?: string
  artistName?: string
  albumName?: string
  durationMs?: number
  country?: string
}

type ItunesTrack = {
  wrapperType?: string
  kind?: string
  trackId?: number
  trackName?: string
  artistName?: string
  collectionName?: string
  previewUrl?: string
  artworkUrl100?: string
  trackViewUrl?: string
  trackTimeMillis?: number
  country?: string
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/feat\.?|ft\.?|with|explicit|remaster(?:ed)?|version/gi, ' ')
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .trim()
}

function textScore(candidate: unknown, target: unknown) {
  const a = normalizeText(candidate)
  const b = normalizeText(target)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.82

  const aTokens = new Set(a.split(/\s+/).filter(Boolean))
  const bTokens = b.split(/\s+/).filter(Boolean)
  if (!aTokens.size || !bTokens.length) return 0

  const hits = bTokens.filter((token) => aTokens.has(token)).length
  return hits / Math.max(aTokens.size, bTokens.length)
}

function durationScore(candidateMs: unknown, targetMs: unknown) {
  const a = Number(candidateMs)
  const b = Number(targetMs)
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
    return 0.5
  }

  const diff = Math.abs(a - b)
  if (diff <= 2500) return 1
  if (diff <= 7000) return 0.75
  if (diff <= 15000) return 0.42
  return 0
}

function scoreCandidate(track: ItunesTrack, input: PreviewInput) {
  const title = textScore(track.trackName, input.trackTitle)
  const artist = textScore(track.artistName, input.artistName)
  const album = input.albumName ? textScore(track.collectionName, input.albumName) : 0.5
  const duration = durationScore(track.trackTimeMillis, input.durationMs)

  return title * 0.48 + artist * 0.32 + album * 0.08 + duration * 0.12
}

async function searchItunes(input: PreviewInput, country: string) {
  const term = [input.trackTitle, input.artistName].filter(Boolean).join(' ')
  if (!term.trim()) return []

  const url = new URL('https://itunes.apple.com/search')
  url.searchParams.set('term', term)
  url.searchParams.set('media', 'music')
  url.searchParams.set('entity', 'song')
  url.searchParams.set('limit', '10')
  url.searchParams.set('country', country)
  url.searchParams.set('lang', 'ko_kr')

  const response = await fetch(url)
  if (!response.ok) return []

  const data = await response.json().catch(() => ({}))
  return Array.isArray(data?.results) ? data.results as ItunesTrack[] : []
}

export async function resolveItunesPreview(input: PreviewInput) {
  const countries = [
    String(input.country || 'KR').slice(0, 2).toUpperCase(),
    'US',
  ].filter((country, index, list) => country && list.indexOf(country) === index)

  const candidates: Array<ItunesTrack & { confidence: number }> = []
  for (const country of countries) {
    const results = await searchItunes(input, country)
    for (const result of results) {
      if (
        result?.wrapperType !== 'track' ||
        result?.kind !== 'song' ||
        typeof result.previewUrl !== 'string' ||
        !result.previewUrl
      ) {
        continue
      }

      candidates.push({
        ...result,
        confidence: scoreCandidate(result, input),
      })
    }

    const bestForCountry = candidates
      .filter((candidate) => candidate.country === country || !candidate.country)
      .sort((a, b) => b.confidence - a.confidence)[0]
    if (bestForCountry?.confidence >= 0.78) break
  }

  candidates.sort((a, b) => b.confidence - a.confidence)
  const best = candidates[0]
  if (!best || best.confidence < 0.58) return null

  return best
}
