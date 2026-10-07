import { describe, expect, it } from 'vitest'
import { githubUrl } from './url'

describe('githubUrl', () => {
  it('lets GitHub pages through', () => {
    expect(githubUrl('https://github.com/o/r/actions/runs/1')).toBe('https://github.com/o/r/actions/runs/1')
    expect(githubUrl('https://github.com/login/device')).toBe('https://github.com/login/device')
  })

  it('rejects scripts, other sites and look-alikes', () => {
    expect(githubUrl('javascript:alert(1)')).toBeNull()
    expect(githubUrl('http://github.com/o/r')).toBeNull()
    expect(githubUrl('https://github.com.evil.example/o/r')).toBeNull()
    expect(githubUrl('https://evil.example/https://github.com/')).toBeNull()
    expect(githubUrl('https://gist.github.com/x')).toBeNull()
    expect(githubUrl('not a url')).toBeNull()
    expect(githubUrl(null)).toBeNull()
  })
})
