// Tabelas fiscais (IMT, Imposto do Selo, Benefício Jovem) e cálculos puros associados.
// Fonte única: impostos.json publicado em tabelas.solucoeseficazes.pt; o fallback local
// espelha esse JSON e é usado enquanto o fetch não termina ou se falhar.

export const TABELAS_URL = 'https://tabelas.solucoeseficazes.pt/impostos.json';

export type TipoImovel = 'hpp' | 'secundaria';
export type IsencaoJovem = 'total' | 'parcial' | null;

export interface EscalaoIMT {
  ate: number | null;
  taxa: number;
  abater: number;
  taxa_unica?: boolean;
}

// Escalão de Imposto do Selo sobre crédito: ou por meses (< 1 ano, taxa mensal)
// ou por intervalo de anos [prazo_min_anos, prazo_max_anos) com taxa única.
export interface EscalaoSelo {
  prazo_max_meses?: number;
  taxa_mensal?: number;
  prazo_min_anos?: number;
  prazo_max_anos?: number | null;
  taxa?: number;
  verba_detalhe?: string;
}

export interface TabelaSeloCredito {
  verba: string;
  escaloes: EscalaoSelo[];
}

export interface TabelasFiscais {
  imt: { hpp: EscalaoIMT[]; secundaria: EscalaoIMT[] };
  selo_aquisicao_imovel: { verba: string; taxa: number };
  selo_credito: { geral: TabelaSeloCredito; consumo: TabelaSeloCredito };
  beneficio_jovem: { idade_maxima: number; limite_isencao_total: number; limite_isencao_parcial: number };
}

// Espelho de impostos.json v2026.1 (OC AT 40129/2026 + CIS/TGIS Verbas 1.1, 17.1, 17.2)
export const TABELAS_FALLBACK: TabelasFiscais = {
  imt: {
    hpp: [
      { ate: 106346, taxa: 0, abater: 0 },
      { ate: 145470, taxa: 0.02, abater: 2126.92 },
      { ate: 198347, taxa: 0.05, abater: 6491.02 },
      { ate: 330539, taxa: 0.07, abater: 10457.96 },
      { ate: 660982, taxa: 0.08, abater: 13763.35 },
      { ate: 1150853, taxa: 0.06, abater: 0, taxa_unica: true },
      { ate: null, taxa: 0.075, abater: 0, taxa_unica: true },
    ],
    secundaria: [
      { ate: 106346, taxa: 0.01, abater: 0 },
      { ate: 145470, taxa: 0.02, abater: 1063.46 },
      { ate: 198347, taxa: 0.05, abater: 5427.56 },
      { ate: 330539, taxa: 0.07, abater: 9394.5 },
      { ate: 660982, taxa: 0.08, abater: 12699.89 },
      { ate: 1150853, taxa: 0.06, abater: 0, taxa_unica: true },
      { ate: null, taxa: 0.075, abater: 0, taxa_unica: true },
    ],
  },
  selo_aquisicao_imovel: { verba: '1.1', taxa: 0.008 },
  selo_credito: {
    geral: {
      verba: '17.1',
      escaloes: [
        { prazo_max_meses: 12, taxa_mensal: 0.0004, verba_detalhe: '17.1.1' },
        { prazo_min_anos: 1, prazo_max_anos: 5, taxa: 0.005, verba_detalhe: '17.1.2' },
        { prazo_min_anos: 5, prazo_max_anos: null, taxa: 0.006, verba_detalhe: '17.1.3' },
      ],
    },
    consumo: {
      verba: '17.2',
      escaloes: [
        { prazo_max_meses: 12, taxa_mensal: 0.00141, verba_detalhe: '17.2 (<1 ano)' },
        { prazo_min_anos: 1, prazo_max_anos: null, taxa: 0.0176, verba_detalhe: '17.2 (>=1 ano)' },
      ],
    },
  },
  beneficio_jovem: {
    idade_maxima: 35,
    limite_isencao_total: 330539,
    limite_isencao_parcial: 660982,
  },
};

const isNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isRegisto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const isEscaloesIMT = (arr: unknown): arr is EscalaoIMT[] =>
  Array.isArray(arr) &&
  arr.length > 0 &&
  arr.every((e) => isRegisto(e) && isNumero(e.taxa) && isNumero(e.abater));

const isTabelaSelo = (tabela: unknown): tabela is TabelaSeloCredito =>
  isRegisto(tabela) &&
  Array.isArray(tabela.escaloes) &&
  tabela.escaloes.length > 0 &&
  tabela.escaloes.every((e) => isRegisto(e) && (isNumero(e.taxa) || isNumero(e.taxa_mensal)));

// Valida o JSON remoto; secções inválidas ou em falta caem para o fallback
export function mergeTabelas(data: unknown): TabelasFiscais {
  const f = TABELAS_FALLBACK;
  if (!isRegisto(data)) return f;

  const imt = isRegisto(data.imt) ? data.imt : {};
  const seloAquisicao = data.selo_aquisicao_imovel;
  const seloCredito = isRegisto(data.selo_credito) ? data.selo_credito : {};
  const bj = data.beneficio_jovem;
  const isBeneficioJovemValido =
    isRegisto(bj) && isNumero(bj.limite_isencao_total) && isNumero(bj.limite_isencao_parcial);

  return {
    imt: {
      hpp: isEscaloesIMT(imt.hpp) ? imt.hpp : f.imt.hpp,
      secundaria: isEscaloesIMT(imt.secundaria) ? imt.secundaria : f.imt.secundaria,
    },
    selo_aquisicao_imovel:
      isRegisto(seloAquisicao) && isNumero(seloAquisicao.taxa)
        ? { verba: String(seloAquisicao.verba ?? f.selo_aquisicao_imovel.verba), taxa: seloAquisicao.taxa }
        : f.selo_aquisicao_imovel,
    selo_credito: {
      geral: isTabelaSelo(seloCredito.geral) ? seloCredito.geral : f.selo_credito.geral,
      consumo: isTabelaSelo(seloCredito.consumo) ? seloCredito.consumo : f.selo_credito.consumo,
    },
    beneficio_jovem: isBeneficioJovemValido
      ? { ...f.beneficio_jovem, ...(bj as Partial<TabelasFiscais['beneficio_jovem']>) }
      : f.beneficio_jovem,
  };
}

// IMT por escalões: taxa marginal com parcela a abater, ou taxa única nos escalões de topo
export function calcPorEscaloes(valor: number, escaloes: EscalaoIMT[]): number {
  const escalao = escaloes.find((e) => e.ate === null || valor <= e.ate);
  if (!escalao) return 0;
  if (escalao.taxa_unica) return valor * escalao.taxa;
  return Math.max(0, valor * escalao.taxa - escalao.abater);
}

// Benefício Jovem (DL 48-A/2024) — só em HPP: isenção total até ao 4.º escalão,
// parcial até ao 5.º, nenhuma acima disso
export function getIsencaoJovem(
  valor: number,
  tipoImovel: TipoImovel,
  isJovem: boolean,
  beneficio: TabelasFiscais['beneficio_jovem'],
): IsencaoJovem {
  if (!isJovem || tipoImovel !== 'hpp') return null;
  if (valor <= beneficio.limite_isencao_total) return 'total';
  if (valor <= beneficio.limite_isencao_parcial) return 'parcial';
  return null;
}

export function calcularIMT(valor: number, tipoImovel: TipoImovel, isJovem: boolean, tabelas: TabelasFiscais): number {
  const escaloes = tipoImovel === 'secundaria' ? tabelas.imt.secundaria : tabelas.imt.hpp;
  const isencao = getIsencaoJovem(valor, tipoImovel, isJovem, tabelas.beneficio_jovem);
  if (isencao === 'total') return 0;
  if (isencao === 'parcial') {
    const limite = tabelas.beneficio_jovem.limite_isencao_total;
    return Math.max(0, calcPorEscaloes(valor, tabelas.imt.hpp) - calcPorEscaloes(limite, tabelas.imt.hpp));
  }
  return calcPorEscaloes(valor, escaloes);
}

// Verba 1.1 — sobre o valor de aquisição; isenção Jovem só em HPP
export function calcularSeloAquisicao(
  valor: number,
  tipoImovel: TipoImovel,
  isJovem: boolean,
  tabelas: TabelasFiscais,
): number {
  const taxa = tabelas.selo_aquisicao_imovel.taxa;
  const isencao = getIsencaoJovem(valor, tipoImovel, isJovem, tabelas.beneficio_jovem);
  if (isencao === 'total') return 0;
  if (isencao === 'parcial') return (valor - tabelas.beneficio_jovem.limite_isencao_total) * taxa;
  return valor * taxa;
}

export interface SeloCredito {
  valor: number;
  taxa: number; // taxa efectiva aplicada ao capital (ex. 0.006, ou taxa_mensal × meses)
}

const MESES_POR_ANO = 12;

// Escolhe o escalão pelo prazo: < prazo_max_meses usa taxa mensal × meses; caso contrário
// o intervalo [prazo_min_anos, prazo_max_anos) em anos (mínimo inclusivo, máximo exclusivo)
function calcSeloPorPrazo(capital: number, prazoMeses: number, tabela: TabelaSeloCredito): SeloCredito {
  if (capital <= 0 || prazoMeses <= 0) return { valor: 0, taxa: 0 };
  const prazoAnos = prazoMeses / MESES_POR_ANO;

  const escalaoMensal = tabela.escaloes.find(
    (e) => isNumero(e.prazo_max_meses) && isNumero(e.taxa_mensal) && prazoMeses < e.prazo_max_meses,
  );
  if (escalaoMensal && isNumero(escalaoMensal.taxa_mensal)) {
    const taxa = escalaoMensal.taxa_mensal * prazoMeses;
    return { valor: capital * taxa, taxa };
  }

  const escalaoAnual = tabela.escaloes.find(
    (e) =>
      isNumero(e.prazo_min_anos) &&
      isNumero(e.taxa) &&
      prazoAnos >= e.prazo_min_anos &&
      (e.prazo_max_anos == null || prazoAnos < e.prazo_max_anos),
  );
  const taxa = escalaoAnual?.taxa ?? 0;
  return { valor: capital * taxa, taxa };
}

// Verba 17.1 (crédito habitação/geral) — prazo em anos; nunca isento pelo Benefício Jovem
export function calcSeloCredito(capital: number, prazoAnos: number, tabela: TabelaSeloCredito): SeloCredito {
  return calcSeloPorPrazo(capital, prazoAnos * MESES_POR_ANO, tabela);
}

// Verba 17.2 (crédito ao consumo: pessoal/automóvel) — prazo em meses
export function calcSeloConsumo(capital: number, prazoMeses: number, tabela: TabelaSeloCredito): SeloCredito {
  return calcSeloPorPrazo(capital, prazoMeses, tabela);
}

// Formata uma taxa (0.00846) como percentagem PT sem zeros supérfluos ("0,846%")
export function formatTaxaPct(taxa: number): string {
  const pct = Number((taxa * 100).toFixed(3));
  return `${String(pct).replace('.', ',')}%`;
}
