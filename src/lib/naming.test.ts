import { describe, expect, it } from 'vitest'
import { readableSampleName } from './naming'

describe('readableSampleName', () => {
  it('matches the two given examples', () => {
    expect(readableSampleName('BOS_DSRH_90_Trombone_Loop_Protection_C')).toBe('BOS - Trombone Loop Protection')
    expect(readableSampleName('MADLIB_86_music_loop_ritual_Fmaj')).toBe('Madlib - Music Loop Ritual')
  })
  it('drops sharp/flat and minor/major keys of every spelling', () => {
    expect(readableSampleName('BOS_DSRH_140_Tenor_Sax_Loop_Landscape_A#m')).toBe('BOS - Tenor Sax Loop Landscape')
    expect(readableSampleName('BOS_DSRH_85_Trombone_Loop_Drop_D#M')).toBe('BOS - Trombone Loop Drop')
    expect(readableSampleName('MADLIB_142_music_loop_dust_Ebmaj')).toBe('Madlib - Music Loop Dust')
    expect(readableSampleName('MADLIB_89_music_loop_resampled_bodied_D')).toBe('Madlib - Music Loop Resampled Bodied')
  })
  it('keeps time signatures and handles a hand-edited name', () => {
    expect(readableSampleName('MADLIB_78_celeste_cipher_6-8_Ebmin')).toBe('Madlib - Celeste Cipher 6-8')
    expect(readableSampleName('BOS- Trombone_Loop_Mountains')).toBe('BOS - Trombone Loop Mountains')
  })
  it('handles a Splice-style name with a code and a file extension', () => {
    expect(readableSampleName('OSS_HFG1_81_acoustic_guitar_steel_string_pop_rnb_soul_strummed_legacy_Cmaj.wav')).toBe(
      'OSS - Acoustic Guitar Steel String Pop Rnb Soul Strummed Legacy',
    )
  })
  it('leaves names it cannot parse alone', () => {
    expect(readableSampleName('Skank')).toBe('Skank')
    expect(readableSampleName('my beat')).toBe('my beat')
  })
})
