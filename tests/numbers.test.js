import test from 'node:test';
import assert from 'node:assert/strict';
import { roundDecimal, roundNumericFields } from '../src/domain/numbers.js';
import { calculateVolume, estimateOneRm, nextPrescription } from '../src/domain/bilbo.js';
import { formatNumber } from '../src/ui/components/format.js';

test('redondea errores de coma flotante y valores de medio céntimo a dos decimales', () => {
  assert.equal(roundDecimal(32.599999999999998), 32.6);
  assert.equal(roundDecimal(1.005), 1.01);
  assert.equal(roundDecimal(2.675), 2.68);
  assert.equal(roundDecimal(0.1 + 0.2), 0.3);
  assert.equal(formatNumber(32.599999999999998), '32,6');
  assert.deepEqual(roundNumericFields({ id: 2, weightKg: 32.599999999999998, name: 'Ciclo', endedAt: null }), { id: 2, weightKg: 32.6, name: 'Ciclo', endedAt: null });
});

test('volumen, 1RM y siguiente peso se calculan con dos decimales', () => {
  assert.equal(calculateVolume(32.6, 3), 97.8);
  assert.equal(estimateOneRm(32.6, 17), 51.07);
  assert.equal(nextPrescription({ status: 'ACTIVE', type: 'PROGRESSIVE', incrementKg: 0.1 }, [{ weightKg: 32.5, reps: 20, performedAt: '2026-10-01' }]).weightKg, 32.6);
});
