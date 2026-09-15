/**
 * Full-bleed wordmark: the text is forced to exactly the SVG width, so it
 * always spans the viewport, and a turbulence filter gives it print grain.
 */
export function Wordmark({ text = 'LOOPLAB' }: { text?: string }) {
  return (
    <svg viewBox="0 0 1000 150" className="block h-auto w-full select-none" role="img" aria-label={text}>
      <defs>
        <filter id="wm-grain" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" result="noise" />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0.94  0 0 0 0 0.92  0 0 0 0 0.89  0 0 0 0.9 -0.35"
            result="speckle"
          />
          <feComposite in="speckle" in2="SourceGraphic" operator="in" result="grainOnText" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="grainOnText" />
          </feMerge>
        </filter>
      </defs>
      <text
        x="0"
        y="142"
        textLength="1000"
        lengthAdjust="spacingAndGlyphs"
        fill="#111111"
        filter="url(#wm-grain)"
        style={{ fontFamily: 'Archivo, "Helvetica Neue", Arial, sans-serif', fontWeight: 900, fontSize: 190, fontVariationSettings: '"wdth" 125' }}
      >
        {text}
      </text>
    </svg>
  )
}
