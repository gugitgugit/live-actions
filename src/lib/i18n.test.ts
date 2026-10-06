import { describe, expect, it } from 'vitest'
import en from '../../public/_locales/en/messages.json'
import ko from '../../public/_locales/ko/messages.json'
import { t, tAround } from './i18n'

type Messages = Record<string, { message: string; placeholders?: Record<string, { content: string }> }>
const placeholdersIn = (s: string) => [...s.matchAll(/\$([A-Za-z0-9_]+)\$/g)].map((m) => m[1].toLowerCase()).sort()

describe('locale files', () => {
  it('have the same keys', () => {
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort())
  })

  it.each([
    ['en', en as Messages],
    ['ko', ko as Messages],
  ])('%s: every placeholder in a message is defined, and every definition is used', (_, messages) => {
    for (const [key, entry] of Object.entries(messages)) {
      const defined = Object.keys(entry.placeholders ?? {}).sort()
      expect([key, placeholdersIn(entry.message)]).toEqual([key, defined])
    }
  })

  it('keep the same placeholders and argument order in both languages', () => {
    for (const [key, entry] of Object.entries(en as Messages)) {
      expect([key, (ko as Messages)[key].placeholders]).toEqual([key, entry.placeholders])
    }
  })

  it('have no empty messages (chrome.i18n returns "" for missing ones, so empty would fall back)', () => {
    for (const messages of [en, ko] as Messages[]) {
      for (const [key, entry] of Object.entries(messages)) expect([key, entry.message.length > 0]).toEqual([key, true])
    }
  })
})

describe('t without chrome.i18n', () => {
  it('falls back to English and fills placeholders by argument order', () => {
    expect(t('errorHttp', 502, 'Bad gateway')).toBe('GitHub error 502: Bad gateway')
    expect(t('durationMinutes', 2, '05')).toBe('2m 05s')
  })

  it('splits a sentence around its placeholder', () => {
    expect(tAround('signedInAs')).toEqual(['Signed in as ', ''])
    expect(tAround('installHint')).toEqual(["Actions Pulse can't see this repository's runs. To track them, ", '.'])
  })
})
