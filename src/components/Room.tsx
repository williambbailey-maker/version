import { useEffect, useRef, useState } from 'react'
import type { Pack } from '../lib/loops'
import type { PackStats } from '../lib/packs'
import type { RoomMap, RoomObject } from '../lib/room'

type Props = {
  playing: boolean
  masterBPM: number
  tagCounts: Map<string, number>
  packs: Pack[]
  packStats: Map<string, PackStats>
  sessionsCount: number
  roomMap: RoomMap
  onPlayToggle: () => void
  onSessions: () => void
  onAdd: () => void
  onTag: (tag: string) => void
  onPack: (id: string) => void
}

const PER_SHELF = 6

/**
 * The studio: a monoline room whose objects are the navigation.
 * Room 1 is the desk (play, sessions, instruments → tags), room 2 the shelf
 * (packs, six per page; the lamp picks one at random). Desktop slides
 * between rooms; phones stack them.
 */
export function Room(props: Props) {
  const { playing, masterBPM, tagCounts, packs, packStats, sessionsCount, roomMap, onPlayToggle, onSessions, onAdd, onTag, onPack } = props
  const [room, setRoom] = useState(0)
  const [page, setPage] = useState(0)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000)
    return () => clearInterval(t)
  }, [])

  const count = (tag: string) => tagCounts.get(tag) ?? 0
  const tipFor = (obj: RoomObject) => `#${roomMap[obj].toUpperCase()} · ${count(roomMap[obj])}`
  const pages = Math.max(1, Math.ceil(packs.length / PER_SHELF))
  const shelfPacks = packs.slice(page * PER_SHELF, page * PER_SHELF + PER_SHELF)
  const randomPack = () => {
    if (packs.length === 0) return
    onPack(packs[Math.floor(Math.random() * packs.length)]!.id)
  }

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

  // analogue clock hands
  const minutes = now.getMinutes() + now.getSeconds() / 60
  const hours = (now.getHours() % 12) + minutes / 60
  const hand = (cx: number, cy: number, len: number, deg: number) => {
    const r = ((deg - 90) * Math.PI) / 180
    return `M${cx} ${cy}L${(cx + len * Math.cos(r)).toFixed(1)} ${(cy + len * Math.sin(r)).toFixed(1)}`
  }

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


      {/* analogue wall clock */}
      <circle className="w" cx="920" cy="110" r="26" />
      <path className="l" d="M920 88v4M920 128v4M898 110h4M938 110h4" />
      <path className="l" d={hand(920, 110, 12, hours * 30)} />
      <path className="l" d={hand(920, 110, 18, minutes * 6)} />
      <circle className="f" cx="920" cy="110" r="2" />
      <g className="eq">
        <rect className="f" x="902" y="160" width="6" height="30" />
        <rect className="f" x="912" y="160" width="6" height="30" />
        <rect className="f" x="922" y="160" width="6" height="30" />
        <rect className="f" x="932" y="160" width="6" height="30" />
      </g>

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

      {/* plant on the left */}
      <g className="leaf">
        <path className="l" d="M120 300v-60M120 250c-20-10-30-30-28-52 22 4 34 22 28 52zM120 268c18-12 40-10 50 6-16 12-40 10-50-6zM120 236c-14-16-14-40-2-58 12 14 14 38 2 58z" />
      </g>
      <path className="w" d="M96 300h48l-6 44H102z" />

      {/* small succulent on the desk */}
      <path className="w" d="M352 300h24l-3 -14h-18z" />
      <path className="l" d="M356 286c-2-10 2-18 8-22 6 4 10 12 8 22M364 286c-8-4-12-12-10-20M364 286c8-4 12-12 10-20M360 286c-1-6 1-10 4-12" />


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

      {/* trombone leaning on the desk → tag */}
      <g {...hotProps(`Trombone: loops tagged ${roomMap.trombone}`, () => onTag(roomMap.trombone))}>
        <rect x="786" y="196" width="170" height="106" fill="transparent" />
        <g transform="rotate(-26 868 262)">
          <path className="w" d="M836 249l-42-19c-10 8-10 30 0 38l42-19z" />
          <path className="l" d="M836 250h90a7 7 0 0 1 0 14h-98a7 7 0 0 0 0 14h112" />
          <path className="l" d="M912 250v14M866 264v14M898 264v14M940 274v8" />
          <ellipse className="w" cx="944" cy="278" rx="3" ry="4.5" />
        </g>
        <g className="tip">
          <rect x="812" y="176" width="120" height="20" rx="10" />
          <text x="872" y="190" textAnchor="middle">{tipFor('trombone')}</text>
        </g>
      </g>

      {/* mic → tag */}
      <g {...hotProps(`Mic: loops tagged ${roomMap.mic}`, () => onTag(roomMap.mic))}>
        <rect x="176" y="222" width="58" height="84" fill="transparent" />
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

      {/* FX pedal on the floor → tag */}
      <g {...hotProps(`FX pedal: loops tagged ${roomMap.fx}`, () => onTag(roomMap.fx))}>
        <rect x="266" y="330" width="120" height="80" fill="transparent" />
        <path className="l" d="M246 380h30M406 380h30" />
        <rect className="w" x="276" y="336" width="100" height="68" rx="6" />
        <circle className="l" cx="298" cy="354" r="7" />
        <circle className="l" cx="326" cy="354" r="7" />
        <circle className="l" cx="354" cy="354" r="7" />
        <path className="l" d="M298 347v7M326 347v7M354 347v7" />
        <circle className="f" cx="326" cy="372" r="3" />
        <rect className="w" x="306" y="380" width="40" height="14" rx="7" />
        <g className="tip">
          <rect x="266" y="306" width="120" height="20" rx="10" />
          <text x="326" y="320" textAnchor="middle">{tipFor('fx')}</text>
        </g>
      </g>

      {/* basket under the desk → add loops */}
      <g {...hotProps('Basket: add loops', onAdd)}>
        <rect x="636" y="326" width="128" height="84" fill="transparent" />
        <path className="w" d="M646 350h108l-10 54h-88z" />
        <ellipse className="w" cx="700" cy="350" rx="54" ry="8" />
        <path className="l" d="M652 366h96M656 382h88M660 396h80M672 350l-6 54M686 350l-3 54M714 350l3 54M728 350l6 54" />
        <path className="l" d="M670 344c6-16 54-16 60 0" />
        <g className="tip">
          <rect x="645" y="304" width="110" height="20" rx="10" />
          <text x="700" y="318" textAnchor="middle">ADD LOOPS</text>
        </g>
      </g>

      {/* amp on the floor → tag */}
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
    const label = p.name.length > 30 ? p.name.slice(0, 29) + '…' : p.name
    return (
      <g key={p.id} {...hotProps(`Pack: ${p.name}`, () => onPack(p.id))}>
        <rect className="w" x={x} y={y} width="250" height="76" rx="5" />
        <circle className="l" cx={x + 85} cy={y + 46} r="11" />
        <circle className="l" cx={x + 165} cy={y + 46} r="11" />
        <path className="l" d={`M${x + 96} ${y + 46}h58`} />
        <text x={x + 125} y={y + 22} textAnchor="middle" fontSize="10.5">{label.toUpperCase()}</text>
        <g className="tip">
          <rect x={x + 55} y={y - 28} width="140" height="20" rx="10" />
          <text x={x + 125} y={y - 14} textAnchor="middle">
            {s ? `${s.count} LOOPS${s.bpmMin !== null ? ` · ${s.bpmMin}–${s.bpmMax}` : ''}` : 'PACK'}
          </text>
        </g>
      </g>
    )
  }

  const shelf = (
    <svg className="scene block h-auto w-full" viewBox="0 0 1000 420" role="group" aria-label="The shelf">
      <path className="l" d="M40 190h920M40 320h920M40 400h920" />
      {shelfPacks.slice(0, 3).map((p, i) => tape(p, 60 + i * 270, 112))}
      {shelfPacks.slice(3, 6).map((p, i) => tape(p, 60 + i * 270, 242))}
      {packs.length === 0 && (
        <text x="500" y="160" textAnchor="middle" fontSize="11" fill="#8a7a72">
          THE SHELF IS EMPTY. IMPORT A FOLDER AND IT FILLS UP.
        </text>
      )}
      {pages > 1 && (
        <g {...hotProps(`Next shelf (${page + 1} of ${pages})`, () => setPage((page + 1) % pages))}>
          <rect className="w" x="880" y="336" width="72" height="56" rx="4" />
          <path className="l" d="M900 364h30M922 356l8 8-8 8" />
          <text x="916" y="352" textAnchor="middle" fontSize="9">{page + 1}/{pages}</text>
        </g>
      )}
      {/* lamp → random pack */}
      <g {...hotProps('Lamp: open a pack at random', randomPack)}>
        <rect x="866" y="70" width="90" height="120" fill="transparent" />
        <path className="w" d="M912 98c-22 0-38 14-38 34h76c0-20-16-34-38-34z" />
        <path className="l" d="M912 132v46M892 178h40" />
        <path className="l" d="M912 178v12" />
        <circle className="f" cx="912" cy="136" r="3" />
        <g className="tip">
          <rect x="832" y="64" width="160" height="20" rx="10" />
          <text x="912" y="78" textAnchor="middle">SURPRISE ME</text>
        </g>
      </g>
    </svg>
  )

  // Desktop: the two rooms sit in a horizontal scroll-snap track, so a
  // two-finger swipe on a trackpad or Magic Mouse slides between them
  // natively; the dots and the nav arrows scroll the same track.
  const track = useRef<HTMLDivElement>(null)
  const goRoom = (r: number) => {
    const el = track.current
    setRoom(r)
    if (el) el.scrollTo({ left: r * el.clientWidth, behavior: 'smooth' })
  }
  const onTrackScroll = () => {
    const el = track.current
    if (!el || el.clientWidth === 0) return
    const r = Math.round(el.scrollLeft / el.clientWidth)
    if (r !== room) setRoom(r)
  }
  // Wheel fallback: a sideways flick on a mouse that sends small deltas
  // adds up to one room change per gesture, even where the browser snaps
  // each tick straight back.
  useEffect(() => {
    const el = track.current
    if (!el) return
    let acc = 0
    let locked = false
    let quiet: ReturnType<typeof setTimeout> | undefined
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      clearTimeout(quiet)
      quiet = setTimeout(() => { acc = 0; locked = false }, 350)
      if (locked) return
      acc += e.deltaX
      if (Math.abs(acc) < 80) return
      locked = true
      const current = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
      const next = Math.max(0, Math.min(1, current + (acc > 0 ? 1 : -1)))
      acc = 0
      if (next !== current) goRoom(next)
    }
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => { el.removeEventListener('wheel', onWheel); clearTimeout(quiet) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="relative">
      {/* desktop: swipe between rooms */}
      <div className="hidden md:block">
        <div ref={track} onScroll={onTrackScroll} className="room-track flex" aria-roledescription="carousel">
          <div className="w-full shrink-0 snap-start">{desk}</div>
          <div className="w-full shrink-0 snap-start">{shelf}</div>
        </div>
        <div className="mt-2 flex justify-center gap-2">
          <button type="button" onClick={() => goRoom(0)} aria-label="The desk" className={['h-2 w-2 rounded-full', room === 0 ? 'bg-ink' : 'bg-line'].join(' ')} />
          <button type="button" onClick={() => goRoom(1)} aria-label="The shelf" className={['h-2 w-2 rounded-full', room === 1 ? 'bg-ink' : 'bg-line'].join(' ')} />
        </div>
      </div>
      {/* phone: stacked */}
      <div className="flex flex-col gap-6 md:hidden">
        {desk}
        {shelf}
      </div>
      {/* phone only: the small nav pill. Desktop swipes between rooms instead. */}
      <div className="md:hidden">
        <RoomNav room={room} onRoom={goRoom} onSessions={onSessions} />
      </div>
    </div>
  )
}

/** The small dark pill at the bottom: info, menu, previous, next. */
function RoomNav({ room, onRoom, onSessions }: { room: number; onRoom: (r: number) => void; onSessions: () => void }) {
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
              ['sessions', 'Sessions'],
              ['mix', 'Mix'],
              ['library', 'Library'],
              ['add', 'Add loops'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" onClick={() => { if (id === 'sessions') { setMenu(false); onSessions() } else jump(id) }} className="pill pill-outline">
              {label}
            </button>
          ))}
        </div>
      )}
      {info && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom,0px))] z-20 mx-auto w-[min(420px,calc(100%-32px))] rounded-2xl border-[1.5px] border-ink bg-cream p-4 text-xs leading-relaxed">
          <p className="caption mb-2">How the studio works</p>
          <p>Hover anything and it tells you what it holds. The turntable plays and stops. Headphones open your saved sessions. Instruments open loops with a tag, sorted by how far they stretch to sit on your drums. Swipe sideways to reach the shelf. The shelf is your packs; the lamp opens one at random. The basket under the desk adds loops.</p>
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
