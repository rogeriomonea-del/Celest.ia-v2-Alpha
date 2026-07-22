import { useId } from 'react'
import type { Airport } from '../types'

/** Um trecho da jornada projetado sobre o globo (open-jaw permitido). */
export interface GlobeLeg {
  origin: Airport
  destination: Airport
}

interface NebulaGlobeProps {
  origin: Airport
  destination: Airport
  /** Jornada multidestinos: com ≥2 trechos o globo desenha todos os arcos. */
  legs?: GlobeLeg[] | null
  /** Índice do trecho destacado (arco brilhante + avião + rótulos). */
  activeLeg?: number
  className?: string
}

// ---------------------------------------------------------------- jornada
// Faixa de projeção: os aeroportos da jornada são distribuídos ao longo da
// mesma banda diagonal usada pela rota simples (canto inferior-esquerdo →
// limbo superior-direito), preservando a composição do hero.
const GLOBE_CENTER: readonly [number, number] = [450, 355]
const BAND_A: readonly [number, number] = [210, 410]
const BAND_B: readonly [number, number] = [676, 150]
const BAND_C: readonly [number, number] = [430, 175]

interface GlobeNode {
  airport: Airport
  x: number
  y: number
}

interface GlobeArc {
  from: number
  to: number
  path: string
  midX: number
  midY: number
  angleDeg: number
}

function bandPoint(t: number): [number, number] {
  const u = 1 - t
  return [
    u * u * BAND_A[0] + 2 * u * t * BAND_C[0] + t * t * BAND_B[0],
    u * u * BAND_A[1] + 2 * u * t * BAND_C[1] + t * t * BAND_B[1],
  ]
}

/** Arco quadrático entre dois nós; `flip` curva para o lado oposto (retorno). */
function arcBetween(p: GlobeNode, q: GlobeNode, flip: boolean): Omit<GlobeArc, 'from' | 'to'> {
  const mx = (p.x + q.x) / 2
  const my = (p.y + q.y) / 2
  let nx = mx - GLOBE_CENTER[0]
  let ny = my - GLOBE_CENTER[1]
  const norm = Math.hypot(nx, ny)
  if (norm < 1) {
    nx = 0
    ny = -1
  } else {
    nx /= norm
    ny /= norm
  }
  if (flip) {
    nx = -nx
    ny = -ny
  }
  const span = Math.hypot(q.x - p.x, q.y - p.y)
  const lift = Math.min(96, Math.max(34, span * 0.24))
  const cx = mx + nx * lift
  const cy = my + ny * lift
  return {
    path: `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`,
    midX: 0.25 * p.x + 0.5 * cx + 0.25 * q.x,
    midY: 0.25 * p.y + 0.5 * cy + 0.25 * q.y,
    angleDeg: (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI,
  }
}

/**
 * Projeta a jornada sobre o globo: aeroportos únicos (na ordem da primeira
 * visita) viram nós na banda; cada trecho vira um arco entre os seus nós.
 * Trechos que "voltam" (destino já visitado antes da origem) curvam para o
 * lado oposto, desenhando o circuito de ida-e-volta sem sobreposição.
 */
function journeyLayout(legs: GlobeLeg[]): { nodes: GlobeNode[]; arcs: GlobeArc[] } {
  const order: Airport[] = []
  const indexByCode = new Map<string, number>()
  const nodeIndex = (airport: Airport): number => {
    const known = indexByCode.get(airport.code)
    if (known !== undefined) return known
    const next = order.length
    order.push(airport)
    indexByCode.set(airport.code, next)
    return next
  }

  const pairs = legs.map((leg) => ({ from: nodeIndex(leg.origin), to: nodeIndex(leg.destination) }))
  const nodes: GlobeNode[] = order.map((airport, index) => {
    const [x, y] = bandPoint(order.length === 1 ? 0.5 : index / (order.length - 1))
    return { airport, x, y }
  })
  const arcs: GlobeArc[] = pairs.map(({ from, to }) => ({
    from,
    to,
    ...arcBetween(nodes[from], nodes[to], to < from),
  }))
  return { nodes, arcs }
}

const SURFACE_LIGHTS = [
  [526, 181, 1.7, 'cyan'],
  [545, 187, 1.2, 'gold'],
  [561, 195, 1.5, 'gold'],
  [579, 207, 1.1, 'gold'],
  [593, 219, 1.8, 'gold'],
  [611, 231, 1.1, 'gold'],
  [624, 246, 1.4, 'gold'],
  [575, 234, 1, 'cyan'],
  [552, 226, 1.2, 'gold'],
  [530, 218, 0.9, 'cyan'],
  [510, 207, 1.3, 'gold'],
  [487, 198, 0.9, 'cyan'],
  [603, 267, 1.3, 'gold'],
  [586, 282, 1, 'gold'],
  [563, 293, 1.5, 'gold'],
  [546, 311, 1, 'cyan'],
  [521, 322, 1.1, 'gold'],
  [497, 335, 0.9, 'cyan'],
  [347, 245, 1.2, 'cyan'],
  [329, 257, 0.8, 'cyan'],
  [310, 275, 1.1, 'gold'],
  [296, 292, 0.8, 'cyan'],
  [283, 317, 1.2, 'cyan'],
  [299, 338, 0.9, 'gold'],
  [320, 351, 1.1, 'cyan'],
  [337, 371, 0.8, 'gold'],
  [344, 397, 1.1, 'cyan'],
  [355, 420, 0.9, 'gold'],
  [365, 446, 1.2, 'cyan'],
  [380, 467, 0.8, 'cyan'],
  [640, 204, 1.2, 'gold'],
  [629, 217, 0.8, 'gold'],
  [616, 195, 1.1, 'gold'],
  [604, 185, 0.75, 'gold'],
  [590, 174, 1.05, 'gold'],
  [575, 166, 0.7, 'cyan'],
  [560, 160, 1.1, 'gold'],
  [546, 174, 0.8, 'gold'],
  [532, 190, 1.15, 'gold'],
  [518, 197, 0.75, 'cyan'],
  [505, 184, 0.9, 'gold'],
  [491, 175, 0.7, 'gold'],
  [552, 251, 1.05, 'gold'],
  [566, 265, 0.75, 'gold'],
  [538, 274, 1.2, 'gold'],
  [521, 288, 0.7, 'cyan'],
  [505, 302, 1.05, 'gold'],
  [487, 315, 0.7, 'gold'],
  [472, 331, 0.9, 'cyan'],
  [277, 245, 0.75, 'cyan'],
  [288, 255, 1.05, 'cyan'],
  [306, 264, 0.7, 'gold'],
  [320, 279, 1.05, 'cyan'],
  [331, 291, 0.7, 'cyan'],
  [340, 309, 0.9, 'gold'],
  [350, 329, 0.75, 'cyan'],
  [359, 348, 1.05, 'gold'],
  [367, 369, 0.7, 'cyan'],
  [374, 390, 0.9, 'gold'],
] as const

function formatCoordinate(value: number, positive: 'N' | 'E', negative: 'S' | 'W') {
  const hemisphere = value >= 0 ? positive : negative
  return `${Math.abs(value).toFixed(4)}° ${hemisphere}`
}

export function NebulaGlobe({ origin, destination, legs = null, activeLeg = 0, className = '' }: NebulaGlobeProps) {
  const instanceId = useId().replace(/:/g, '')
  const id = (name: string) => `${instanceId}-${name}`
  const url = (name: string) => `url(#${id(name)})`

  const journey = legs && legs.length >= 2 ? journeyLayout(legs) : null
  const activeArc = journey ? (journey.arcs[Math.min(Math.max(activeLeg, 0), journey.arcs.length - 1)] ?? null) : null
  const activeOriginNode = journey && activeArc ? journey.nodes[activeArc.from] : null
  const activeDestinationNode = journey && activeArc ? journey.nodes[activeArc.to] : null

  const labelOrigin = activeOriginNode?.airport ?? origin
  const labelDestination = activeDestinationNode?.airport ?? destination
  const originCoordinates = `${formatCoordinate(labelOrigin.latitude, 'N', 'S')}, ${formatCoordinate(labelOrigin.longitude, 'E', 'W')}`
  const destinationCoordinates = `${formatCoordinate(labelDestination.latitude, 'N', 'S')}, ${formatCoordinate(labelDestination.longitude, 'E', 'W')}`

  return (
    <svg
      aria-hidden="true"
      className={`block h-full w-full overflow-visible ${className}`}
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      viewBox="0 0 900 700"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id={id('sphere')} cx="71%" cy="18%" r="92%" fx="70%" fy="13%">
          <stop offset="0" stopColor="#32677d" stopOpacity="0.48" />
          <stop offset="0.2" stopColor="#13374d" stopOpacity="0.9" />
          <stop offset="0.56" stopColor="#06182b" />
          <stop offset="0.84" stopColor="#020b17" />
          <stop offset="1" stopColor="#00050d" />
        </radialGradient>

        <radialGradient id={id('terminator')} cx="72%" cy="37%" r="79%">
          <stop offset="0" stopColor="#25546b" stopOpacity="0.1" />
          <stop offset="0.48" stopColor="#061728" stopOpacity="0.08" />
          <stop offset="0.76" stopColor="#01050e" stopOpacity="0.68" />
          <stop offset="1" stopColor="#00030b" stopOpacity="0.94" />
        </radialGradient>

        <radialGradient id={id('warm-limb')} cx="78%" cy="35%" r="54%">
          <stop offset="0" stopColor="#d4b068" stopOpacity="0.14" />
          <stop offset="0.48" stopColor="#9a6f2d" stopOpacity="0.055" />
          <stop offset="1" stopColor="#9a6f2d" stopOpacity="0" />
        </radialGradient>

        <linearGradient id={id('atmosphere')} x1="0.13" y1="0.12" x2="0.9" y2="0.82">
          <stop offset="0" stopColor="#eef8fb" stopOpacity="0.95" />
          <stop offset="0.18" stopColor="#91f5f4" stopOpacity="0.78" />
          <stop offset="0.52" stopColor="#218ca3" stopOpacity="0.25" />
          <stop offset="0.83" stopColor="#d4b068" stopOpacity="0.19" />
          <stop offset="1" stopColor="#d4b068" stopOpacity="0.025" />
        </linearGradient>

        <linearGradient id={id('route')} gradientUnits="userSpaceOnUse" x1="210" y1="410" x2="676" y2="150">
          <stop offset="0" stopColor="#2fd0d4" />
          <stop offset="0.65" stopColor="#91f5f4" />
          <stop offset="0.84" stopColor="#d4b068" />
          <stop offset="1" stopColor="#f1d38c" />
        </linearGradient>

        <radialGradient id={id('cyan-glow')}>
          <stop offset="0" stopColor="#effefe" />
          <stop offset="0.18" stopColor="#91f5f4" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#2fd0d4" stopOpacity="0.35" />
          <stop offset="1" stopColor="#2fd0d4" stopOpacity="0" />
        </radialGradient>

        <radialGradient id={id('gold-glow')}>
          <stop offset="0" stopColor="#fff8dc" />
          <stop offset="0.2" stopColor="#f1d38c" stopOpacity="0.95" />
          <stop offset="0.58" stopColor="#d4b068" stopOpacity="0.3" />
          <stop offset="1" stopColor="#d4b068" stopOpacity="0" />
        </radialGradient>

        <pattern id={id('cyan-dust')} width="27" height="25" patternUnits="userSpaceOnUse">
          <circle cx="4" cy="6" r="0.8" fill="#70c8d7" opacity="0.42" />
          <circle cx="18" cy="13" r="0.55" fill="#abdfe9" opacity="0.3" />
          <circle cx="10" cy="22" r="0.45" fill="#55e6e6" opacity="0.28" />
        </pattern>

        <pattern id={id('gold-dust')} width="23" height="21" patternUnits="userSpaceOnUse">
          <circle cx="4" cy="8" r="0.75" fill="#e4cd9b" opacity="0.62" />
          <circle cx="16" cy="4" r="0.5" fill="#d4b068" opacity="0.45" />
          <circle cx="13" cy="17" r="0.65" fill="#f1e6cc" opacity="0.44" />
        </pattern>

        <clipPath id={id('sphere-clip')}>
          <circle cx="450" cy="355" r="295" />
        </clipPath>

        <filter id={id('soft-glow')} x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="7" />
        </filter>

        <filter id={id('route-glow')} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="4.5" />
        </filter>
      </defs>

      <g className="nebula-orbit-spin" fill="none" stroke="#70c8d7">
        <ellipse cx="450" cy="355" rx="386" ry="314" opacity="0.095" strokeWidth="0.8" />
        <ellipse cx="450" cy="355" rx="354" ry="380" opacity="0.08" strokeDasharray="2 10" strokeWidth="0.8" transform="rotate(37 450 355)" />
        <ellipse cx="450" cy="355" rx="430" ry="220" opacity="0.07" strokeWidth="0.7" transform="rotate(-16 450 355)" />
        <circle cx="450" cy="355" r="333" opacity="0.085" strokeDasharray="1 13" strokeWidth="0.7" />
      </g>

      <g className="nebula-globe-drift">
        <circle cx="450" cy="355" r="302" fill="none" filter={url('soft-glow')} opacity="0.22" stroke="#70c8d7" strokeWidth="10" />
        <circle cx="450" cy="355" r="296" fill={url('sphere')} />

        <g clipPath={url('sphere-clip')}>
          <circle cx="450" cy="355" r="295" fill={url('warm-limb')} />

          <g opacity="0.45">
            <path
              d="M405 143 438 128l37 9 22 17 35 7 26 20 46 5 39 25 8 24-23 20-36 1-28 19-36-12-24-26-35-3-20-21-35-5-17-23 10-25Z"
              fill="#17374b"
              stroke="#5a8293"
              strokeOpacity="0.22"
            />
            <path
              d="M487 237 523 249l25 25-3 35-20 25-7 43-25 50-24-12-10-38 6-37-17-31 11-35Z"
              fill="#102b3f"
              stroke="#70c8d7"
              strokeOpacity="0.16"
            />
            <path
              d="M254 209 292 181l48-10 34 15 22 29-18 23-37 5-23 28-28 14-21-22-29-15-8-20Z"
              fill="#123047"
              stroke="#5a8293"
              strokeOpacity="0.18"
            />
            <path
              d="M291 284 322 298l24 39-5 39 21 34 4 50 22 38-18 48-24-22-10-43-24-31-6-47-17-37-16-39Z"
              fill="#0d293e"
              stroke="#5a8293"
              strokeOpacity="0.17"
            />
            <path d="M405 143 438 128l37 9 22 17 35 7 26 20 46 5 39 25 8 24-23 20-36 1-28 19-36-12-24-26-35-3-20-21-35-5-17-23 10-25Z" fill={url('gold-dust')} />
            <path d="M487 237 523 249l25 25-3 35-20 25-7 43-25 50-24-12-10-38 6-37-17-31 11-35Z" fill={url('gold-dust')} opacity="0.55" />
            <path d="M254 209 292 181l48-10 34 15 22 29-18 23-37 5-23 28-28 14-21-22-29-15-8-20Z" fill={url('cyan-dust')} />
            <path d="M291 284 322 298l24 39-5 39 21 34 4 50 22 38-18 48-24-22-10-43-24-31-6-47-17-37-16-39Z" fill={url('cyan-dust')} />
          </g>

          <g fill="none" stroke="#70c8d7" strokeOpacity="0.115" strokeWidth="0.75">
            <ellipse cx="450" cy="355" rx="285" ry="74" />
            <ellipse cx="450" cy="287" rx="276" ry="68" />
            <ellipse cx="450" cy="223" rx="245" ry="58" />
            <ellipse cx="450" cy="164" rx="188" ry="42" />
            <ellipse cx="450" cy="423" rx="276" ry="68" />
            <ellipse cx="450" cy="487" rx="245" ry="58" />
            <ellipse cx="450" cy="546" rx="188" ry="42" />
            <ellipse cx="450" cy="355" rx="68" ry="292" />
            <ellipse cx="450" cy="355" rx="139" ry="292" />
            <ellipse cx="450" cy="355" rx="218" ry="292" />
            <ellipse cx="450" cy="355" rx="111" ry="292" transform="rotate(22 450 355)" />
            <ellipse cx="450" cy="355" rx="111" ry="292" transform="rotate(-22 450 355)" />
          </g>

          <g fill="none" stroke="#d4b068" strokeOpacity="0.11" strokeWidth="0.65">
            <path d="M417 160c42 13 61 29 82 55 16 21 40 37 78 42" />
            <path d="M431 177c31 18 43 31 60 55 20 28 53 40 101 49" />
            <path d="M472 252c22 25 33 51 29 83-3 30 6 52 26 80" />
            <path d="M294 218c42 16 64 39 71 70 6 27-1 45-20 66" />
            <path d="M312 308c25 22 35 43 33 70-2 29 10 57 34 83" />
          </g>

          {SURFACE_LIGHTS.map(([x, y, radius, tone], index) => (
            <circle
              key={`${x}-${y}-${index}`}
              cx={x}
              cy={y}
              fill={tone === 'gold' ? '#e4cd9b' : '#70c8d7'}
              opacity={tone === 'gold' ? 0.72 : 0.46}
              r={radius}
            />
          ))}

          <circle cx="450" cy="355" r="295" fill={url('terminator')} />
          <ellipse cx="620" cy="230" rx="125" ry="155" fill={url('warm-limb')} opacity="0.56" />
        </g>

        <circle cx="450" cy="355" r="295" fill="none" stroke={url('atmosphere')} strokeWidth="2.2" />
        <path
          d="M201 196A295 295 0 0 1 694 174"
          fill="none"
          filter={url('soft-glow')}
          opacity="0.8"
          stroke={url('atmosphere')}
          strokeLinecap="round"
          strokeWidth="7"
        />
        <path d="M201 196A295 295 0 0 1 694 174" fill="none" opacity="0.9" stroke={url('atmosphere')} strokeLinecap="round" strokeWidth="1.6" />
      </g>

      {journey && activeArc && activeOriginNode && activeDestinationNode ? (
        <>
          <g fill="none" strokeLinecap="round">
            {journey.arcs.map((arc, index) =>
              index === activeLeg ? null : (
                <path
                  key={`arc-${index}`}
                  d={arc.path}
                  opacity="0.38"
                  stroke="#70c8d7"
                  strokeWidth="1.1"
                  vectorEffect="non-scaling-stroke"
                />
              ),
            )}
            <path d={activeArc.path} filter={url('route-glow')} opacity="0.42" stroke={url('route')} strokeWidth="7" />
            <path d={activeArc.path} opacity="0.95" stroke={url('route')} strokeWidth="1.65" vectorEffect="non-scaling-stroke" />
            <path
              className="nebula-route-dash"
              d={activeArc.path}
              opacity="0.9"
              stroke={url('route')}
              strokeDasharray="1 24"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          </g>

          <g fill="#061728" stroke="#91f5f4" strokeWidth="1.4" vectorEffect="non-scaling-stroke">
            {journey.nodes.map((node, index) =>
              index === activeArc.from || index === activeArc.to ? null : (
                <circle key={`node-${node.airport.code}-${index}`} cx={node.x} cy={node.y} r="4.2" />
              ),
            )}
          </g>

          <g className="nebula-plane-pulse" transform={`translate(${activeArc.midX.toFixed(1)} ${activeArc.midY.toFixed(1)})`}>
            <circle r="22" fill={url('cyan-glow')} opacity="0.72" />
            <circle r="9" fill="none" stroke="#d8f0f5" strokeOpacity="0.5" strokeWidth="0.8" />
          </g>
          <g
            className="nebula-plane"
            transform={`translate(${activeArc.midX.toFixed(1)} ${activeArc.midY.toFixed(1)}) rotate(${activeArc.angleDeg.toFixed(1)}) scale(.78)`}
          >
            <path
              d="M-15 1.2-4.2-2l5-13.7 3.8-.7-.6 13.1 11.4-2.8 3.8 2.2L4.3 2.3l-1.1 8-3.1.9-2.5-7.5-9.3 2.6Z"
              fill="#eef8fb"
              stroke="#91f5f4"
              strokeLinejoin="round"
              strokeWidth="0.65"
            />
          </g>

          <g className="nebula-city-pulse" transform={`translate(${activeOriginNode.x.toFixed(1)} ${activeOriginNode.y.toFixed(1)}) scale(0.72)`}>
            <circle r="58" fill="none" opacity="0.08" stroke="#55e6e6" />
            <circle r="45" fill="none" opacity="0.13" stroke="#55e6e6" />
            <circle r="32" fill="none" opacity="0.2" stroke="#55e6e6" />
            <circle r="20" fill="none" opacity="0.34" stroke="#91f5f4" />
            <circle r="24" fill={url('cyan-glow')} opacity="0.88" />
            <circle r="7" fill="#effefe" stroke="#2fd0d4" strokeWidth="3" />
          </g>

          <g
            className="nebula-city-pulse nebula-city-pulse--gold"
            transform={`translate(${activeDestinationNode.x.toFixed(1)} ${activeDestinationNode.y.toFixed(1)}) scale(0.72)`}
          >
            <circle r="47" fill="none" opacity="0.09" stroke="#d4b068" />
            <circle r="35" fill="none" opacity="0.16" stroke="#d4b068" />
            <circle r="24" fill="none" opacity="0.26" stroke="#e4cd9b" />
            <circle r="15" fill="none" opacity="0.42" stroke="#f1e6cc" />
            <circle r="22" fill={url('gold-glow')} opacity="0.95" />
            <circle r="6" fill="#fff8dc" stroke="#d4b068" strokeWidth="3" />
          </g>

          <g fontFamily="Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif">
            {journey.nodes.map((node, index) =>
              index === activeArc.from || index === activeArc.to ? null : (
                <text
                  key={`code-${node.airport.code}-${index}`}
                  x={node.x > 470 ? node.x - 10 : node.x + 10}
                  y={node.y - 9}
                  fill="#70c8d7"
                  fontSize="11"
                  fontWeight="600"
                  letterSpacing="0.5"
                  opacity="0.8"
                  textAnchor={node.x > 470 ? 'end' : 'start'}
                >
                  {node.airport.code}
                </text>
              ),
            )}

            <g textAnchor={activeOriginNode.x > 470 ? 'end' : 'start'}>
              <text
                x={activeOriginNode.x > 470 ? activeOriginNode.x - 30 : activeOriginNode.x + 30}
                y={activeOriginNode.y < 300 ? activeOriginNode.y - 14 : activeOriginNode.y + 11}
                fill="#55e6e6"
                fontSize="16"
                fontWeight="600"
                letterSpacing="0.2"
              >
                {labelOrigin.city} · {labelOrigin.code}
              </text>
              <text
                x={activeOriginNode.x > 470 ? activeOriginNode.x - 30 : activeOriginNode.x + 30}
                y={activeOriginNode.y < 300 ? activeOriginNode.y + 6 : activeOriginNode.y + 31}
                fill="#70c8d7"
                fontSize="10"
                fontWeight="500"
                letterSpacing="0.55"
              >
                {originCoordinates}
              </text>
            </g>

            <g textAnchor={activeDestinationNode.x > 470 ? 'end' : 'start'}>
              <text
                x={activeDestinationNode.x > 470 ? activeDestinationNode.x - 30 : activeDestinationNode.x + 30}
                y={activeDestinationNode.y < 300 ? activeDestinationNode.y - 14 : activeDestinationNode.y + 11}
                fill="#e4cd9b"
                fontSize="16"
                fontWeight="600"
                letterSpacing="0.2"
              >
                {labelDestination.city} · {labelDestination.code}
              </text>
              <text
                x={activeDestinationNode.x > 470 ? activeDestinationNode.x - 30 : activeDestinationNode.x + 30}
                y={activeDestinationNode.y < 300 ? activeDestinationNode.y + 6 : activeDestinationNode.y + 31}
                fill="#d4b068"
                fontSize="10"
                fontWeight="500"
                letterSpacing="0.55"
              >
                {destinationCoordinates}
              </text>
            </g>
          </g>
        </>
      ) : (
        <>
          <g fill="none" stroke={url('route')} strokeLinecap="round">
            <path
              d="M210 410C286 315 360 258 470 210S585 175 676 150"
              filter={url('route-glow')}
              opacity="0.42"
              strokeWidth="7"
            />
            <path
              d="M210 410C286 315 360 258 470 210S585 175 676 150"
              opacity="0.95"
              strokeWidth="1.65"
              vectorEffect="non-scaling-stroke"
            />
            <path
              className="nebula-route-dash"
              d="M210 410C286 315 360 258 470 210S585 175 676 150"
              opacity="0.9"
              strokeDasharray="1 24"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          </g>

          <g fill="#061728" stroke="#91f5f4" strokeWidth="1.4" vectorEffect="non-scaling-stroke">
            <circle cx="282" cy="330" r="4.2" />
            <circle cx="403" cy="245" r="4.2" />
            <circle cx="561" cy="176" r="4.2" />
          </g>

          <g className="nebula-plane-pulse" transform="translate(470 210)">
            <circle r="22" fill={url('cyan-glow')} opacity="0.72" />
            <circle r="9" fill="none" stroke="#d8f0f5" strokeOpacity="0.5" strokeWidth="0.8" />
          </g>
          <g className="nebula-plane" transform="translate(470 210) rotate(-24) scale(.78)">
            <path
              d="M-15 1.2-4.2-2l5-13.7 3.8-.7-.6 13.1 11.4-2.8 3.8 2.2L4.3 2.3l-1.1 8-3.1.9-2.5-7.5-9.3 2.6Z"
              fill="#eef8fb"
              stroke="#91f5f4"
              strokeLinejoin="round"
              strokeWidth="0.65"
            />
          </g>

          <g className="nebula-city-pulse" transform="translate(210 410)">
            <circle r="58" fill="none" opacity="0.08" stroke="#55e6e6" />
            <circle r="45" fill="none" opacity="0.13" stroke="#55e6e6" />
            <circle r="32" fill="none" opacity="0.2" stroke="#55e6e6" />
            <circle r="20" fill="none" opacity="0.34" stroke="#91f5f4" />
            <path d="M-70 0H70M0-70V70" opacity="0.12" stroke="#70c8d7" strokeDasharray="2 6" />
            <circle r="24" fill={url('cyan-glow')} opacity="0.88" />
            <circle r="7" fill="#effefe" stroke="#2fd0d4" strokeWidth="3" />
          </g>

          <g className="nebula-city-pulse nebula-city-pulse--gold" transform="translate(676 150)">
            <circle r="47" fill="none" opacity="0.09" stroke="#d4b068" />
            <circle r="35" fill="none" opacity="0.16" stroke="#d4b068" />
            <circle r="24" fill="none" opacity="0.26" stroke="#e4cd9b" />
            <circle r="15" fill="none" opacity="0.42" stroke="#f1e6cc" />
            <path d="M-57 0H57M0-57V57" opacity="0.14" stroke="#d4b068" strokeDasharray="2 5" />
            <circle r="22" fill={url('gold-glow')} opacity="0.95" />
            <circle r="6" fill="#fff8dc" stroke="#d4b068" strokeWidth="3" />
          </g>

          <g className="nebula-labels-desktop" fontFamily="Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif">
            <text x="245" y="421" fill="#55e6e6" fontSize="17" fontWeight="600" letterSpacing="0.2">
              {origin.city} · {origin.code}
            </text>
            <text x="245" y="443" fill="#70c8d7" fontSize="10.5" fontWeight="500" letterSpacing="0.55">
              {originCoordinates}
            </text>

            <text x="706" y="125" fill="#e4cd9b" fontSize="17" fontWeight="600" letterSpacing="0.2">
              {destination.city} · {destination.code}
            </text>
            <text x="706" y="147" fill="#d4b068" fontSize="10.5" fontWeight="500" letterSpacing="0.55">
              {destinationCoordinates}
            </text>
          </g>

          <g className="nebula-labels-mobile" fontFamily="Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif">
            <text x="245" y="421" fill="#55e6e6" fontSize="17" fontWeight="600" letterSpacing="0.2">
              {origin.city} · {origin.code}
            </text>
            <text x="245" y="443" fill="#70c8d7" fontSize="10.5" fontWeight="500" letterSpacing="0.55">
              {originCoordinates}
            </text>

            <text x="646" y="116" fill="#e4cd9b" fontSize="17" fontWeight="600" letterSpacing="0.2" textAnchor="end">
              {destination.city} · {destination.code}
            </text>
            <text x="646" y="138" fill="#d4b068" fontSize="10.5" fontWeight="500" letterSpacing="0.55" textAnchor="end">
              {destinationCoordinates}
            </text>
          </g>
        </>
      )}
    </svg>
  )
}
