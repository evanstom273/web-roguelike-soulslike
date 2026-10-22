// Which part of the ruins a floor is in. The run starts on the overgrown surface and
// goes underground, then into the depths. Art comes from tools/environment-art.mjs.

const ART = import.meta.glob('../art/environment/**/*.svg', { eager: true, query: '?no-inline', import: 'default' }) as Record<string, string>

const art = (path: string) => {
  const url = ART[`../art/environment/${path}.svg`]
  if (!url) throw new Error(`Missing environment art "${path}"`)
  return url
}

export type DecalPlace = 'floor' | 'wall-inside' | 'wall-over'

export interface DecalDef {
  key: string
  url: string
  width: number
  height: number
  weight: number
  place: DecalPlace
  /** Degrees of random rotation either way. Kept small so baked light stays top-left. */
  turn: number
}

export interface BiomeDef {
  id: string
  name: string
  /** First floor of this biome; it lasts until the next biome's first floor. */
  fromFloor: number
  /** Beyond the edge of the generated area. */
  background: string
  /** How dark unlit areas are, 0..1 (lights cut through it). */
  darkness: number
  lightColour: number
  floor: string[] // hex floor variants, the first used sparingly (it has a centrepiece)
  outside: string
  path: string
  wall: string
  pillar: string
  brazier: string
  threshold: string
  decals: DecalDef[]
  decalsPerCell: [number, number]
}

const decal = (biome: string, key: string, width: number, height: number, weight: number, place: DecalPlace, turn = 12): DecalDef => ({
  key: `${biome}-${key}`,
  url: art(`${biome}/${key}`),
  width,
  height,
  weight,
  place,
  turn,
})

const parts = (id: string) => ({
  floor: ['a', 'b', 'c', 'd'].map((v) => art(`${id}/floor-${v}`)),
  outside: art(`${id}/outside`),
  path: art(`${id}/path`),
  wall: art(`${id}/wall`),
  pillar: art(`${id}/pillar`),
  brazier: art(`${id}/brazier`),
  threshold: art(`${id}/threshold`),
})

export const BIOMES: BiomeDef[] = [
  {
    id: 'surface',
    name: 'Overgrown Ruins',
    fromFloor: 1,
    background: '#0c140a',
    darkness: 0.3,
    lightColour: 0xffa04a,
    ...parts('surface'),
    decals: [
      decal('surface', 'rubble', 160, 160, 3, 'floor'),
      decal('surface', 'puddle', 220, 150, 1, 'floor', 0),
      decal('surface', 'vines', 360, 110, 4, 'wall-inside', 0),
      decal('surface', 'foliage', 260, 260, 5, 'wall-over', 20),
    ],
    decalsPerCell: [2, 4],
  },
  {
    id: 'underground',
    name: 'Sunken Temple',
    fromFloor: 4,
    background: '#15110d',
    darkness: 0.45,
    lightColour: 0xff9440,
    ...parts('underground'),
    decals: [
      decal('underground', 'rubble', 160, 160, 4, 'floor'),
      decal('underground', 'puddle', 220, 150, 2, 'floor', 0),
      decal('underground', 'roots', 380, 200, 3, 'wall-inside', 0),
    ],
    decalsPerCell: [1, 3],
  },
  {
    id: 'depths',
    name: 'The Depths',
    fromFloor: 7,
    background: '#06070a',
    darkness: 0.58,
    lightColour: 0x6fd8ff,
    ...parts('depths'),
    decals: [
      decal('depths', 'rubble', 160, 160, 4, 'floor'),
      decal('depths', 'puddle', 220, 150, 2, 'floor', 0),
    ],
    decalsPerCell: [1, 2],
  },
]

export const LIGHT_URL = art('light')

export function biomeForFloor(floor: number): BiomeDef {
  let found = BIOMES[0]
  for (const b of BIOMES) if (floor >= b.fromFloor) found = b
  return found
}
