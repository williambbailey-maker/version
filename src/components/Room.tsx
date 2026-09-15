import { useEffect, useState } from 'react'
import type { Pack } from '../lib/loops'
import type { PackStats } from '../lib/packs'
import type { RoomMap, RoomObject } from '../lib/room'

type Props = {
  playing: boolean
  bar: number
  masterBPM: number
  tagCounts: Map<string, number>
  packs: Pack[]
  packStats: Map<string, PackStats>
  sessionsCount: number
  roomMap: RoomMap
  onPlayToggle: () => void
  onSessions: () => void
  onTag: (tag: string) => void
  onPack: (id: string) => void
  onAllPacks: () => void
}

/**
 * The studio: a monoline room whose objects are the navigation.
 * Room 1 is the desk (play, sessions, instruments → tags), room 2 the shelf
 * (packs). Desktop slides between rooms; phones stack them.
 */
export function Room(props: Props) {
  const { playing, bar, masterBPM, tagCounts, packs, packStats, sessionsCount, roomMap, onPlayToggle, onSessions, onTag, onPack, onAllPacks } = props
  const [room, setRoom] = useState(0)
  const [clock, setClock] = useState('')

  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setClock(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    }
    tick()
    const t = setInterval(tick, 15000)
    return () => clearInterval(t)
  }, [])

  const count = (tag: string) => tagCounts.get(tag) ?? 0
  const tipFor = (obj: RoomObject) => `#${roomMap[obj].toUpperCase()} · ${count(roomMap[obj])}`
  const shelfPacks = packs.slice(0, 6)
  const more = packs.length - shelfPacks.length

  const hotProps = (label: string, act: () => void) => ({
    className: 'hot',
    tabIndex: 0,
    role: 'button',
    'aria-label': label,
    onClick: act,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        act()
      }
    },
  })

  const desk = (
    <svg className={['scene block h-auto w-full', playing ? 'playing' : ''].join(' ')} viewBox="0 0 1000 420" role="group" aria-label="The desk">
      <defs>
        <clipPath id="win">
          <rect x="640" y="60" width="220" height="150" />
        </clipPath>
      </defs>
      <g clipPath="url(#win)">
        <g className="cloud">
          <path className="l" d="M600 140c-14 0-22-9-22-19 0-13 12-21 24-18 4-13 18-20 30-14 8-8 25-6 29 6 12-3 24 5 24 16 0 12-10 20-22 20z" />
        </g>
        <g className="cloud b">
          <path className="l" d="M540 190c-10 0-16-6-16-13 0-9 9-15 17-13 3-9 13-14 21-10 6-6 18-4 21 4 9-2 17 4 17 11 0 9-7 14-16 14z" />
        </g>
      </g>
      <rect className="l" x="640" y="60" width="220" height="150" rx="3" />
      <line className="l" x1="750" y1="60" x2="750" y2="210" />
      <line className="l" x1="640" y1="135" x2="860" y2="135" />

      <circle className="l" cx="920" cy="110" r="26" />
      <text x="920" y="115" textAnchor="middle" fontSize="12">{clock}</text>
      <g className="eq">
        <rect className="f" x="902" y="160" width="6" height="30" />
        <rect className="f" x="912" y="160" width="6" height="30" />
        <rect className="f" x="922" y="160" width="6" height="30" />
        <rect className="f" x="932" y="160" width="6" height="30" />
      </g>
      <text x="920" y="208" textAnchor="middle" fontSize="10" fill="#8a7a72">
        {playing ? `BAR ${String(bar).padStart(2, '0')}` : 'BAR --'}
      </text>

      {/* headphones → sessions */}
      <g {...hotProps(`Headphones: saved sessions (${sessionsCount})`, onSessions)}>
        <circle className="f" cx="90" cy="70" r="4" />
        <path className="l" d="M90 74v24" />
        <path className="l" d="M60 150c0-26 14-42 30-42s30 16 30 42" />
        <rect className="w" x="52" y="140" width="16" height="30" rx="6" />
        <rect className="w" x="112" y="140" width="16" height="30" rx="6" />
        <rect x="30" y="30" width="120" height="160" fill="transparent" />
        <g className="tip">
          <rect x="40" y="184" width="118" height="20" rx="10" />
          <text x="99" y="198" textAnchor="middle">SESSIONS · {sessionsCount}</text>
        </g>
      </g>

      {/* desk */}
      <rect className="w" x="150" y="300" width="800" height="16" rx="3" />
      <path className="l" d="M175 316v90M925 316v90M175 380h60M925 380h-60" />

      {/* plant */}
      <g className="leaf">
        <path className="l" d="M120 300v-60M120 250c-20-10-30-30-28-52 22 4 34 22 28 52zM120 268c18-12 40-10 50 6-16 12-40 10-50-6zM120 236c-14-16-14-40-2-58 12 14 14 38 2 58z" />
      </g>
      <path className="w" d="M96 300h48l-6 44H102z" />

      {/* turntable → play/stop */}
      <g {...hotProps(playing ? 'Turntable: stop' : 'Turntable: play', onPlayToggle)}>
        <rect className="w" x="380" y="216" width="180" height="84" rx="6" />
        <g className="platter">
          <circle className="w" cx="470" cy="262" r="34" />
          <circle className="l" cx="470" cy="262" r="26" />
          <circle className="l" cx="470" cy="262" r="18" />
          <circle className="f" cx="470" cy="262" r="6" />
          <circle cx="470" cy="262" r="1.5" fill="#fbf6ec" />
        </g>
        <g className="needle">
          <path className="l" d="M520 226l14 30" />
          <circle className="w" cx="520" cy="226" r="6" />
          <rect className="w" x="530" y="252" width="10" height="7" rx="2" />
        </g>
        <rect className="w" x="392" y="280" width="14" height="10" rx="2" />
        <circle className="l" cx="540" cy="288" r="4" />
        <g className="tip">
          <rect x="410" y="190" width="120" height="20" rx="10" />
          <text x="470" y="204" textAnchor="middle">{playing ? 'STOP' : `PLAY · ${masterBPM} BPM`}</text>
        </g>
      </g>

      {/* record crate → sessions */}
      <g {...hotProps(`Record crate: saved sessions (${sessionsCount})`, onSessions)}>
        <rect className="w" x="240" y="236" width="110" height="64" rx="3" />
        <path className="l" d="M256 300v-52l14-10v62M282 300v-50l14-10v60M310 300v-48l14-10v58" />
        <g className="tip">
          <rect x="236" y="206" width="118" height="20" rx="10" />
          <text x="295" y="220" textAnchor="middle">SESSIONS · {sessionsCount}</text>
        </g>
      </g>

      {/* keyboard → tag */}
      <g {...hotProps(`Keyboard: loops tagged ${roomMap.keyboard}`, () => onTag(roomMap.keyboard))}>
        <rect className="w" x="600" y="268" width="180" height="32" rx="3" />
        <path className="l" d="M618 268v32M636 268v32M654 268v32M672 268v32M690 268v32M708 268v32M726 268v32M744 268v32M762 268v32" />
        <path className="f" d="M612 268h8v18h-8zM630 268h8v18h-8zM666 268h8v18h-8zM684 268h8v18h-8zM702 268h8v18h-8zM738 268h8v18h-8zM756 268h8v18h-8z" />
        <g className="tip">
          <rect x="626" y="238" width="128" height="20" rx="10" />
          <text x="690" y="252" textAnchor="middle">{tipFor('keyboard')}</text>
        </g>
      </g>

      {/* mic → tag */}
      <g {...hotProps(`Mic: loops tagged ${roomMap.mic}`, () => onTag(roomMap.mic))}>
        <rect className="w" x="196" y="236" width="18" height="30" rx="9" />
        <path className="l" d="M192 250c0 12 6 20 13 20s13-8 13-20M205 270v30M196 300h18" />
        <path className="l" d="M199 244h12M199 250h12M199 256h12" />
        <g className="tip">
          <rect x="150" y="206" width="110" height="20" rx="10" />
          <text x="205" y="220" textAnchor="middle">{tipFor('mic')}</text>
        </g>
      </g>

      {/* congas → tag */}
      <g {...hotProps(`Congas: loops tagged ${roomMap.congas}`, () => onTag(roomMap.congas))}>
        <path className="w" d="M820 330h56l-6 76h-44z" />
        <ellipse className="w" cx="848" cy="330" rx="28" ry="7" />
        <path className="l" d="M826 352h44M828 372h40" />
        <path className="w" d="M878 336h50l-5 70h-40z" />
        <ellipse className="w" cx="903" cy="336" rx="25" ry="6" />
        <path className="l" d="M884 356h38M886 376h34" />
        <g className="tip">
          <rect x="790" y="302" width="170" height="20" rx="10" />
          <text x="875" y="316" textAnchor="middle">{tipFor('congas')}</text>
        </g>
      </g>

      {/* guitar → tag */}
      <g {...hotProps(`Guitar: loops tagged ${roomMap.guitar}`, () => onTag(roomMap.guitar))}>
        <path className="l" d="M300 322l22 78" />
        <path className="w" d="M330 396c-10 6-26 8-34 2-8-6-8-22 4-30 2-14 16-24 30-18 14 6 18 24 12 34 0 8-4 10-12 12z" />
        <circle className="l" cx="316" cy="382" r="5" />
        <path className="w" d="M296 318l-8-22 12-6 10 22z" />
        <g className="tip">
          <rect x="240" y="338" width="126" height="20" rx="10" />
          <text x="303" y="352" textAnchor="middle">{tipFor('guitar')}</text>
        </g>
      </g>

      {/* amp → tag */}
      <g {...hotProps(`Amp: loops tagged ${roomMap.amp}`, () => onTag(roomMap.amp))}>
        <rect className="w" x="470" y="330" width="120" height="74" rx="4" />
        <rect className="l" x="482" y="352" width="96" height="42" rx="3" />
        <path className="l" d="M494 352v42M506 352v42M518 352v42M530 352v42M542 352v42M554 352v42M566 352v42" />
        <circle className="l" cx="490" cy="341" r="3" />
        <circle className="l" cx="504" cy="341" r="3" />
        <circle className="l" cx="518" cy="341" r="3" />
        <g className="tip">
          <rect x="470" y="404" width="120" height="20" rx="10" />
          <text x="530" y="418" textAnchor="middle">{tipFor('amp')}</text>
        </g>
      </g>
    </svg>
  )

  const tape = (p: Pack, x: number, y: number) => {
    const s = packStats.get(p.id)
    const short = p.name.length > 16 ? p.name.slice(0, 15) + '…' : p.name
    return (
      <g key={p.id} {...hotProps(`Pack: ${p.name}`, () => onPack(p.id))}>
        <rect className="w" x={x} y={y} width="120" height="60" rx="4" />
        <circle className="l" cx={x + 35} cy={y + 30} r="10" />
        <circle className="l" cx={x + 85} cy={y + 30} r="10" />
        <path className="l" d={`M${x + 45} ${y + 30}h30`} />
        <text x={x + 60} y={y + 12} textAnchor="middle" fontSize="9">{short.toUpperCase()}</text>
        <g className="tip">
          <rect x={x - 10} y={y - 28} width="140" height="20" rx="10" />
          <text x={x + 60} y={y - 14} textAnchor="middle">
            {s ? `${s.count} LOOPS${s.bpmMin !== null ? ` · ${s.bpmMin}–${s.bpmMax}` : ''}` : 'PACK'}
          </text>
        </g>
      </g>
    )
  }
  const record = (p: Pack, x: number, y: number) => {
    const s = packStats.get(p.id)
    return (
      <g key={p.id} {...hotProps(`Pack: ${p.name}`, () => onPack(p.id))}>
        <rect className="w" x={x} y={y} width="100" height="100" rx="2" />
        <circle className="l" cx={x + 50} cy={y + 50} r="34" />
        <circle className="f" cx={x + 50} cy={y + 50} r="5" />
        <g className="tip">
          <rect x={x - 20} y={y - 28} width="140" height="20" rx="10" />
          <text x={x + 50} y={y - 14} textAnchor="middle">
            {(p.name.length > 12 ? p.name.slice(0, 11) + '…' : p.name).toUpperCase()}{s ? ` · ${s.count}` : ''}
          </text>
        </g>
      </g>
    )
  }

  const shelf = (
    <svg className="scene block h-auto w-full" viewBox="0 0 1000 420" role="group" aria-label="The shelf">
      <text x="60" y="70" fontSize="11" fill="#e8453c">
        {packs.length ? '● EACH TAPE IS A PACK. PULL ONE DOWN.' : '● THE SHELF IS EMPTY. IMPORT A FOLDER AND IT FILLS UP.'}
      </text>
      <path className="l" d="M60 180h880M60 300h880M60 360h880" />
      {shelfPacks.slice(0, 3).map((p, i) => tape(p, 90 + i * 150, 120))}
      {shelfPacks.slice(3, 6).map((p, i) => record(p, 620 + i * 120, 200))}
      {more > 0 && (
        <g {...hotProps(`${more} more packs`, onAllPacks)}>
          <rect className="w" x="560" y="120" width="120" height="60" rx="4" />
          <text x="620" y="155" textAnchor="middle" fontSize="11">+{more} MORE</text>
        </g>
      )}
      <path className="l" d="M900 120c-20 0-34 12-34 30h68c0-18-14-30-34-30zM900 150v30" />
      <rect className="w" x="120" y="230" width="90" height="56" rx="6" />
      <circle className="l" cx="150" cy="258" r="14" />
      <path className="l" d="M176 246h22M176 258h22M176 270h22" />
      <text x="500" y="392" textAnchor="middle" fontSize="11" fill="#8a7a72">
        THE SHELF — {packs.length} PACK{packs.length === 1 ? '' : 'S'}
      </text>
    </svg>
  )

  return (
    <div className="relative">
      {/* desktop: slide between rooms */}
      <div className="hidden overflow-hidden md:block">
        <div className="flex transition-transform duration-500 ease-in-out motion-reduce:transition-none" style={{ transform: `translateX(-${room * 100}%)` }}>
          <div className="w-full shrink-0">{desk}</div>
          <div className="w-full shrink-0">{shelf}</div>
        </div>
        <div className="mt-2 flex justify-center gap-2">
          <button type="button" onClick={() => setRoom(0)} aria-label="The desk" className={['h-2 w-2 rounded-full', room === 0 ? 'bg-ink' : 'bg-line'].join(' ')} />
          <button type="button" onClick={() => setRoom(1)} aria-label="The shelf" className={['h-2 w-2 rounded-full', room === 1 ? 'bg-ink' : 'bg-line'].join(' ')} />
        </div>
      </div>
      {/* phone: stacked */}
      <div className="flex flex-col gap-6 md:hidden">
        {desk}
        {shelf}
      </div>
      <RoomNav room={room} onRoom={setRoom} />
    </div>
  )
}

/** The small dark pill at the bottom: info, menu, previous, next. */
function RoomNav({ room, onRoom }: { room: number; onRoom: (r: number) => void }) {
  const [menu, setMenu] = useState(false)
  const [info, setInfo] = useState(false)
  const jump = (id: string) => {
    setMenu(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const btn = 'grid h-8 w-10 place-items-center rounded-full text-cream transition-colors duration-200 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none'
  return (
    <>
      {menu && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom,0px))] z-20 mx-auto flex w-max max-w-[calc(100%-32px)] flex-wrap justify-center gap-2 rounded-2xl border-[1.5px] border-ink bg-cream p-3">
          {(
            [
              ['studio', 'Studio'],
              ['mix', 'Mix'],
              ['sessions', 'Sessions'],
              ['packs', 'Packs'],
              ['library', 'Library'],
              ['add', 'Add loop'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" onClick={() => jump(id)} className="pill pill-outline">
              {label}
            </button>
          ))}
        </div>
      )}
      {info && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom,0px))] z-20 mx-auto w-[min(420px,calc(100%-32px))] rounded-2xl border-[1.5px] border-ink bg-cream p-4 text-xs leading-relaxed">
          <p className="caption mb-2">How the studio works</p>
          <p>Hover anything and it tells you what it holds. The turntable plays and stops. Headphones and the crate open your saved sessions. Instruments open loops with a tag, sorted by how far they stretch to sit on your drums. The shelf is your packs. Change which tag an instrument opens under Sessions → Studio settings.</p>
          <button type="button" onClick={() => setInfo(false)} className="pill pill-outline mt-3">Close</button>
        </div>
      )}
      <nav aria-label="Studio" className="fixed bottom-[calc(16px+env(safe-area-inset-bottom,0px))] left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-full bg-ink p-1.5">
        <button type="button" onClick={() => { setInfo((v) => !v); setMenu(false) }} title="What is this?" className={btn}>i</button>
        <button type="button" onClick={() => { setMenu((v) => !v); setInfo(false) }} title="Menu" className={btn}>≡</button>
        <span className="mx-0.5 my-1 w-px bg-cream/25" />
        <button type="button" onClick={() => { onRoom(Math.max(0, room - 1)); jump('studio') }} title="Previous room" className={[btn, 'hidden md:grid'].join(' ')}>‹</button>
        <button type="button" onClick={() => { onRoom(Math.min(1, room + 1)); jump('studio') }} title="Next room" className={[btn, 'hidden md:grid'].join(' ')}>›</button>
        <button type="button" onClick={() => jump('studio')} title="Back to the studio" className={[btn, 'md:hidden'].join(' ')}>↑</button>
      </nav>
    </>
  )
}
