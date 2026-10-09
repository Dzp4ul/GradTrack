import assert from 'node:assert/strict';
import {
  clearGraduateAccountResume,
  hasGraduateAccountResume,
  readGraduateAccountResume,
  saveGraduateAccountResume,
} from '../src/services/graduateAccountResume.ts';

const values = new Map();
globalThis.sessionStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); },
  clear() { values.clear(); },
  key(index) { return [...values.keys()][index] ?? null; },
  get length() { return values.size; },
};

const saved = saveGraduateAccountResume({
  graduateId: 12,
  graduateName: 'Juan Graduate',
  surveyResponseId: 34,
  surveyToken: 'short-lived-token',
  surveyTitle: 'Graduate Tracer Survey',
  prefill: {
    first_name: 'Juan',
    middle_name: '',
    last_name: 'Graduate',
    email: 'JUAN@EXAMPLE.COM',
    phone: '09123456789',
    year_graduated: '2026',
    address: 'Norzagaray, Bulacan',
    program_id: 1,
    program_name: 'Bachelor of Science in Computer Science',
  },
});

assert.ok(saved.expiresAt > Date.now(), 'resume context must expire');
assert.equal(hasGraduateAccountResume(), true);
assert.equal(readGraduateAccountResume()?.prefill.email, 'juan@example.com');

values.set('gradtrack_graduate_account_resume_v1', JSON.stringify({ ...saved, expiresAt: Date.now() - 1 }));
assert.equal(readGraduateAccountResume(), null, 'expired resume context must be rejected');
assert.equal(hasGraduateAccountResume(), false);

saveGraduateAccountResume({ ...saved, expiresAt: undefined });
clearGraduateAccountResume();
assert.equal(readGraduateAccountResume(), null, 'cleared resume context must not be returned');

console.log('Graduate account resume tests passed.');
