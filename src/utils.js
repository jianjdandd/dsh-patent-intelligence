import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export const DEFAULT_JURISDICTIONS = ['CN','US','EP','WO','JP','KR','GB','DE','FR','CA','AU','IN']

export async function resolveWorkspace(input) {
  const p = path.resolve(input || './patent-workspace')
  await mkdir(p, { recursive: true })
  return p
}

export function cleanText(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim()
}

export function normNumber(v) {
  return cleanText(v).toUpperCase().replace(/[\s./_-]+/g, '')
}

export function splitList(v) {
  if (Array.isArray(v)) return v.map(cleanText).filter(Boolean)
  return cleanText(v).split(/[;；|\n,，]+/).map(cleanText).filter(Boolean)
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

export function hash(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex')
}

export function quoteTerm(term) {
  const t = cleanText(term).replace(/"/g, '\\"')
  if (!t) return ''
  return /\s/.test(t) ? `"${t}"` : t
}

export function jurisdictionOf(publicationNumber = '') {
  const m = cleanText(publicationNumber).toUpperCase().match(/^([A-Z]{2})/)
  return m?.[1] || ''
}

export function xmlText(s = '') {
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim()
}
