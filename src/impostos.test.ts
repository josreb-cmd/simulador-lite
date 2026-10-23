/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularIMT, TABELAS_FALLBACK } from './impostos.ts';

const CENTIMO = 0.005;

const assertEuros = (obtido: number, esperado: number) =>
  assert.ok(Math.abs(obtido - esperado) < CENTIMO, `esperado ${esperado}, obtido ${obtido}`);

test('IMT secundária: 633.931 € é o último valor do escalão de 8%', () => {
  assertEuros(calcularIMT(633931, 'secundaria', false, TABELAS_FALLBACK), 38014.59);
});

test('IMT secundária: 633.932 € passa à taxa única de 6%', () => {
  assertEuros(calcularIMT(633932, 'secundaria', false, TABELAS_FALLBACK), 38035.92);
});

test('IMT secundária: 650.000 € paga 6% sobre o valor total', () => {
  assertEuros(calcularIMT(650000, 'secundaria', false, TABELAS_FALLBACK), 39000);
});
