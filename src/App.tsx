import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  TABELAS_FALLBACK,
  TABELAS_URL,
  calcSeloConsumo,
  calcSeloCredito,
  calcularIMT,
  calcularSeloAquisicao,
  formatTaxaPct,
  getIsencaoJovem,
  mergeTabelas,
} from './impostos';
import type { TabelasFiscais, TipoImovel } from './impostos';

// Formata valores monetários com separador de milhares em formato PT-PT (ex: 8.680,00 €)
// Nota: usa formatação manual em vez de toLocaleString('pt-PT'), porque essa locale só
// agrupa milhares quando o primeiro grupo tem 2+ dígitos (ex: 20000 e 28680 ficam bem,
// mas 8680 ficaria "8680,00" sem separador). Esta versão agrupa sempre, de forma consistente.
const formatEuro = (valor: number): string => {
  if (!Number.isFinite(valor)) return '— €';
  const negativo = valor < 0;
  const [parteInteira, parteDecimal] = Math.abs(valor).toFixed(2).split('.');
  const inteiraComSeparador = parteInteira.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${negativo ? '-' : ''}${inteiraComSeparador},${parteDecimal} €`;
};

// Um campo pode estar temporariamente vazio enquanto o utilizador edita (apagou tudo
// antes de escrever um novo valor) — '' representa esse estado intermédio.
type NumOrEmpty = number | '';

// Converte um valor de estado (possivelmente vazio/NaN) num número seguro para cálculos.
const safeNum = (val: NumOrEmpty): number => (val === '' || isNaN(val as number) ? 0 : Number(val));

// Tipo de campo numérico:
// - 'percentagem': vírgula ou ponto como separador decimal (ex: "3,05" ou "3.75")
// - 'euro': ponto é separador de milhares e vírgula é separador decimal (ex: "200.000,50")
type TipoCampoNumerico = 'percentagem' | 'euro';

// Converte texto limpo (separador decimal já normalizado para ".") em número; "." isolado vale 0.
const parseDecimal = (texto: string): NumOrEmpty => {
  if (texto === '') return '';
  const num = Number(`0${texto}`);
  return isNaN(num) ? '' : num;
};

// Percentagem: só dígitos e um único separador decimal (vírgula ou ponto, mantém o que o
// utilizador escreveu); remove zeros à esquerda (mas preserva "0" isolado e "0,x").
const limparPercentagem = (input: string): string => {
  const raw = input.replace(/[^\d.,]/g, '');
  const idxSeparador = raw.search(/[.,]/);
  if (idxSeparador === -1) return raw.replace(/^0+(?=\d)/, '');
  const inteira = raw.slice(0, idxSeparador).replace(/^0+(?=\d)/, '');
  const decimal = raw.slice(idxSeparador + 1).replace(/[.,]/g, '');
  return `${inteira}${raw[idxSeparador]}${decimal}`;
};

const agruparMilhares = (inteira: string): string => inteira.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// Euro: reagrupa a parte inteira com pontos de milhares a cada tecla (ex: "10000" → "10.000")
// e aceita uma única vírgula decimal; remove zeros à esquerda (mas preserva "0" isolado e "0,x").
const limparEuro = (input: string): string => {
  const raw = input.replace(/[^\d.,]/g, '');
  const idxVirgula = raw.indexOf(',');
  const inteiraRaw = idxVirgula === -1 ? raw : raw.slice(0, idxVirgula);
  const inteira = agruparMilhares(inteiraRaw.replace(/\./g, '').replace(/^0+(?=\d)/, ''));
  if (idxVirgula === -1) return inteira;
  const decimal = raw.slice(idxVirgula + 1).replace(/[.,]/g, '');
  return `${inteira},${decimal}`;
};

// Posição no texto limpo logo a seguir ao n-ésimo carácter significativo (dígito ou
// separador decimal). Permite manter o cursor no mesmo sítio depois de reformatar.
const posicaoAposSignificativos = (texto: string, n: number, significativo: RegExp): number => {
  if (n <= 0) return 0;
  let contados = 0;
  for (let i = 0; i < texto.length; i++) {
    if (significativo.test(texto[i])) contados++;
    if (contados === n) return i + 1;
  }
  return texto.length;
};

const contarSignificativos = (texto: string, significativo: RegExp): number =>
  [...texto].filter((ch) => significativo.test(ch)).length;

const CAMPO_NUMERICO: Record<
  TipoCampoNumerico,
  {
    limpar: (input: string) => string;
    parse: (texto: string) => NumOrEmpty;
    formatar: (value: number) => string;
    significativo: RegExp; // caracteres que contam para a posição do cursor (os pontos de milhares não)
  }
> = {
  percentagem: {
    significativo: /[\d.,]/,
    limpar: limparPercentagem,
    parse: (texto) => parseDecimal(texto.replace(',', '.')),
    formatar: (value) => String(value).replace('.', ','),
  },
  euro: {
    significativo: /[\d,]/,
    limpar: limparEuro,
    parse: (texto) => parseDecimal(texto.replace(/\./g, '').replace(',', '.')),
    formatar: (value) => {
      const [inteira, decimal] = String(value).split('.');
      return decimal ? `${agruparMilhares(inteira)},${decimal}` : agruparMilhares(inteira);
    },
  },
};

// Input numérico em modo texto: evita o bug nativo do <input type="number"> em que um
// "0" inicial não é substituído mas sim antecedido pelos dígitos seguintes (ex: "0800000").
// Também permite deixar o campo vazio enquanto o utilizador edita, em vez de forçar "0".
// Guarda o texto escrito para não perder estados intermédios como "3," ou "3,0" (que como
// número seriam só 3). Os separadores aceites dependem do `tipo` (ver TipoCampoNumerico).
function FormattedNumberInput({
  value,
  onChange,
  tipo,
  className,
}: {
  value: NumOrEmpty;
  onChange: (v: NumOrEmpty) => void;
  tipo: TipoCampoNumerico;
  className?: string;
}) {
  const campo = CAMPO_NUMERICO[tipo];
  const formatarValor = (v: NumOrEmpty): string => (v === '' ? '' : campo.formatar(v));
  const [texto, setTexto] = useState<string>(() => formatarValor(value));
  const inputRef = useRef<HTMLInputElement>(null);
  // Posição do cursor a repor depois do próximo render (a reformatação move-o para o fim)
  const cursorPendente = useRef<number | null>(null);

  // Se o valor mudar por fora (não pelo que foi escrito), mostra o valor novo
  const displayValue = campo.parse(texto) === value ? texto : formatarValor(value);

  useLayoutEffect(() => {
    const posicao = cursorPendente.current;
    if (posicao === null || !inputRef.current) return;
    inputRef.current.setSelectionRange(posicao, posicao);
    cursorPendente.current = null;
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value: escrito, selectionStart } = e.target;
    const antesDoCursor = escrito.slice(0, selectionStart ?? escrito.length);
    const limpo = campo.limpar(escrito);
    cursorPendente.current = posicaoAposSignificativos(
      limpo,
      contarSignificativos(antesDoCursor, campo.significativo),
      campo.significativo,
    );
    setTexto(limpo);
    onChange(campo.parse(limpo));
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      className={className}
    />
  );
}

export default function App() {
  const [tipoCredito, setTipoCredito] = useState<'habitacao' | 'pessoal'>('habitacao');

  // Inputs Habitação
  const [valorImovel, setValorImovel] = useState<NumOrEmpty>(200000);
  const [financiamentoPct, setFinanciamentoPct] = useState<number>(90);
  const [prazoHabitacao, setPrazoHabitacao] = useState<NumOrEmpty>(30); // anos
  const [regimeTaxaHab, setRegimeTaxaHab] = useState<'fixa' | 'variavel'>('fixa');
  const [tanHabitacao, setTanHabitacao] = useState<NumOrEmpty>(3.5); // % (usado no regime Fixa)
  const [euribor, setEuribor] = useState<NumOrEmpty>(2.5); // % (usado no regime Variável)
  const [spread, setSpread] = useState<NumOrEmpty>(1.0); // % (usado no regime Variável)

  // Tipo de imóvel e Benefício Jovem (DL 48-A/2024)
  const [tipoImovel, setTipoImovel] = useState<TipoImovel>('hpp');
  const [isJovem, setIsJovem] = useState<boolean>(false);
  const [idadeMutuario, setIdadeMutuario] = useState<NumOrEmpty>(30);

  // Inputs Pessoal
  const [montantePessoal, setMontantePessoal] = useState<NumOrEmpty>(10000);
  const [prazoPessoal, setPrazoPessoal] = useState<NumOrEmpty>(60); // meses
  const [tanPessoal, setTanPessoal] = useState<NumOrEmpty>(8.5); // %

  // Inputs Comuns
  const [rendimentoLiquido, setRendimentoLiquido] = useState<NumOrEmpty>(2500);
  const [outrosEncargos, setOutrosEncargos] = useState<NumOrEmpty>(0);

  // Tabelas fiscais: começa no fallback, substitui pelo JSON remoto se válido
  const [tabelas, setTabelas] = useState<TabelasFiscais>(TABELAS_FALLBACK);

  useEffect(() => {
    const controller = new AbortController();
    fetch(TABELAS_URL, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: unknown) => setTabelas(mergeTabelas(data)))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.warn('Tabelas fiscais remotas indisponíveis, a usar fallback local:', err);
      });
    return () => controller.abort();
  }, []);

  // Cálculos Habitação
  const valorImovelNum = safeNum(valorImovel);
  const prazoHabitacaoNum = safeNum(prazoHabitacao);
  const tanHabitacaoNum = safeNum(tanHabitacao);
  const euriborNum = safeNum(euribor);
  const spreadNum = safeNum(spread);
  const montantePessoalNum = safeNum(montantePessoal);
  const prazoPessoalNum = safeNum(prazoPessoal);
  const tanPessoalNum = safeNum(tanPessoal);
  const rendimentoLiquidoNum = safeNum(rendimentoLiquido);
  const outrosEncargosNum = safeNum(outrosEncargos);

  const tanHabitacaoEfetiva = regimeTaxaHab === 'variavel' ? euriborNum + spreadNum : tanHabitacaoNum;
  const valorFinanciadoHab = valorImovelNum * (financiamentoPct / 100);
  const entradaMinima = valorImovelNum - valorFinanciadoHab;
  const mesesHab = prazoHabitacaoNum * 12;
  const iHab = (tanHabitacaoEfetiva / 100) / 12;

  // Cálculo da prestação (Sistema de Amortização Francês). Devolve 0 em vez de Infinity/NaN
  // quando faltam dados (ex. prazo ainda não preenchido enquanto o utilizador edita).
  const calcularPrestacao = (capital: number, taxaMensal: number, meses: number): number => {
    if (capital <= 0 || meses <= 0) return 0;
    if (taxaMensal === 0) return capital / meses;
    return (capital * (taxaMensal * Math.pow(1 + taxaMensal, meses))) / (Math.pow(1 + taxaMensal, meses) - 1);
  };

  const prestacaoHab = calcularPrestacao(valorFinanciadoHab, iHab, mesesHab);

  // Teste de Stress BdP (+1.5% na TAN) — obrigatório apenas para taxa variável
  const iStress = ((tanHabitacaoEfetiva + 1.5) / 100) / 12;
  const prestacaoStress = calcularPrestacao(valorFinanciadoHab, iStress, mesesHab);

  // Benefício Jovem: só conta com idade elegível; a isenção em si só se aplica a HPP
  const idadeMaximaJovem = tabelas.beneficio_jovem.idade_maxima;
  const idadeMutuarioNum = safeNum(idadeMutuario);
  const isJovemElegivel = idadeMutuarioNum > 0 && idadeMutuarioNum <= idadeMaximaJovem;
  const beneficioJovemAtivo = isJovem && isJovemElegivel;
  const isencaoJovem = getIsencaoJovem(valorImovelNum, tipoImovel, beneficioJovemAtivo, tabelas.beneficio_jovem);
  const isencaoJovemLabel =
    isencaoJovem === 'total' ? ' (isento — Jovem)' : isencaoJovem === 'parcial' ? ' (isenção parcial — Jovem)' : '';

  // Impostos Habitação — IMT pela tabela do tipo de imóvel (OC AT 40129/2026)
  const seloCreditoHab = calcSeloCredito(valorFinanciadoHab, prazoHabitacaoNum, tabelas.selo_credito.geral); // Verba 17.1 — nunca isento por Jovem
  const isCreditoHab = seloCreditoHab.valor;
  const isCompra = calcularSeloAquisicao(valorImovelNum, tipoImovel, beneficioJovemAtivo, tabelas); // Verba 1.1
  const imtEstimadoFinal = Math.max(0, calcularIMT(valorImovelNum, tipoImovel, beneficioJovemAtivo, tabelas));
  const totalImpostosHab = isCreditoHab + isCompra + imtEstimadoFinal;
  const totalNecessario = entradaMinima + totalImpostosHab;

  // Cálculos Pessoal
  const iPes = (tanPessoalNum / 100) / 12;
  const prestacaoPes = calcularPrestacao(montantePessoalNum, iPes, prazoPessoalNum);
  const seloCreditoPes = calcSeloConsumo(montantePessoalNum, prazoPessoalNum, tabelas.selo_credito.consumo); // Verba 17.2
  const isCreditoPes = seloCreditoPes.valor;

  // Taxa de Esforço (DSTI)
  const prestacaoAtiva = tipoCredito === 'habitacao' ? prestacaoHab : prestacaoPes;
  const dstiAtual = rendimentoLiquidoNum > 0 ? ((prestacaoAtiva + outrosEncargosNum) / rendimentoLiquidoNum) * 100 : 0;

  const prestacaoStressTotal = tipoCredito === 'habitacao' ? prestacaoStress + outrosEncargosNum : prestacaoAtiva + outrosEncargosNum;
  const dstiStress = rendimentoLiquidoNum > 0 ? (prestacaoStressTotal / rendimentoLiquidoNum) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-800">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        
        {/* Cabeçalho */}
        <div className="bg-slate-900 text-white p-6">
          <h1 className="text-2xl font-bold">Simulador de Crédito (Normas BdP & Fiscalidade PT)</h1>
          <p className="text-slate-400 text-sm mt-1">Simule Habitação ou Crédito Pessoal com análise automática de DSTI e Teste de Stress.</p>
          
          <div className="flex gap-4 mt-6">
            <button 
              onClick={() => setTipoCredito('habitacao')}
              className={`px-5 py-2.5 rounded-lg font-medium transition-all ${tipoCredito === 'habitacao' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              Crédito Habitação
            </button>
            <button 
              onClick={() => setTipoCredito('pessoal')}
              className={`px-5 py-2.5 rounded-lg font-medium transition-all ${tipoCredito === 'pessoal' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              Crédito Pessoal
            </button>
          </div>
        </div>

        {/* Corpo Principal */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6 md:p-8">
          
          {/* Coluna de Inputs */}
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-slate-900 border-b pb-2">Parâmetros da Simulação</h2>
            
            {tipoCredito === 'habitacao' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Valor do Imóvel (€)</label>
                  <FormattedNumberInput
                    value={valorImovel}
                    tipo="euro"
                    onChange={setValorImovel}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Tipo de Imóvel</label>
                  <select
                    value={tipoImovel}
                    onChange={(e) => setTipoImovel(e.target.value as TipoImovel)}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  >
                    <option value="hpp">Habitação Própria Permanente (HPP)</option>
                    <option value="secundaria">Habitação Secundária</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Idade do Mutuário</label>
                  <FormattedNumberInput
                    value={idadeMutuario}
                    tipo="percentagem"
                    onChange={setIdadeMutuario}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className={`flex items-center gap-2 text-sm font-medium ${isJovemElegivel ? 'text-slate-600' : 'text-slate-400'}`}>
                    <input
                      type="checkbox"
                      checked={beneficioJovemAtivo}
                      disabled={!isJovemElegivel}
                      onChange={(e) => setIsJovem(e.target.checked)}
                      className="w-4 h-4 accent-blue-600"
                    />
                    Benefício Jovem (IMT e Selo na aquisição)
                  </label>
                  {idadeMutuarioNum > idadeMaximaJovem && (
                    <span className="text-xs text-amber-600">Só disponível até aos {idadeMaximaJovem} anos.</span>
                  )}
                  {beneficioJovemAtivo && tipoImovel === 'secundaria' && (
                    <span className="text-xs text-amber-600">Não se aplica a Habitação Secundária.</span>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Financiamento (LTV): {financiamentoPct}%</label>
                  <input 
                    type="range" 
                    min="10" 
                    max="100" 
                    step="5"
                    value={financiamentoPct} 
                    onChange={(e) => setFinanciamentoPct(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                  <span className="text-xs text-slate-500">
                    Recomendado BdP para HPP: até 90% · acima disso, só com regimes especiais (ex. Garantia Pública para jovens)
                  </span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Prazo (Anos)</label>
                  <FormattedNumberInput
                    value={prazoHabitacao}
                    tipo="percentagem"
                    onChange={setPrazoHabitacao}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <span className="text-xs text-slate-500">Entre 5 e 40 anos.</span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Regime de Taxa</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRegimeTaxaHab('fixa')}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${regimeTaxaHab === 'fixa' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                    >
                      Taxa Fixa
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegimeTaxaHab('variavel')}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${regimeTaxaHab === 'variavel' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                    >
                      Taxa Variável
                    </button>
                  </div>
                </div>

                {regimeTaxaHab === 'fixa' ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">TAN Fixa (%)</label>
                    <FormattedNumberInput
                      value={tanHabitacao}
                      tipo="percentagem"
                      onChange={setTanHabitacao}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <span className="text-xs text-slate-500">Taxa fixa durante todo o prazo — sem obrigatoriedade de teste de esforço regulamentar.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">Euribor (%)</label>
                      <FormattedNumberInput
                        value={euribor}
                        tipo="percentagem"
                        onChange={setEuribor}
                        className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">Spread (%)</label>
                      <FormattedNumberInput
                        value={spread}
                        tipo="percentagem"
                        onChange={setSpread}
                        className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2 text-xs text-slate-500">
                      TAN indicativa: <span className="font-semibold text-slate-700">{tanHabitacaoEfetiva.toFixed(2)}%</span> · sujeita a teste de esforço regulamentar (+1,5%)
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Montante do Crédito (€)</label>
                  <FormattedNumberInput
                    value={montantePessoal}
                    tipo="euro"
                    onChange={setMontantePessoal}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Prazo (Meses)</label>
                    <FormattedNumberInput
                      value={prazoPessoal}
                      tipo="percentagem"
                      onChange={setPrazoPessoal}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">TAN (%)</label>
                    <FormattedNumberInput
                      value={tanPessoal}
                      tipo="percentagem"
                      onChange={setTanPessoal}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="border-t pt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Rendimento Líquido Mensal Familiar (€)</label>
                <FormattedNumberInput
                  value={rendimentoLiquido}
                  tipo="euro"
                  onChange={setRendimentoLiquido}
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Outros Créditos / Encargos Atuais (€/mês)</label>
                <FormattedNumberInput
                  value={outrosEncargos}
                  tipo="euro"
                  onChange={setOutrosEncargos}
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

          </div>

          {/* Coluna de Resultados */}
          <div className="bg-slate-100 p-6 rounded-2xl flex flex-col justify-between border border-slate-200">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 border-b border-slate-300 pb-2 mb-4">Resultados e Análise Regulatória</h2>
              
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <span className="text-sm text-slate-500 block">Prestação Mensal Inicial</span>
                  <span className="text-3xl font-bold text-blue-600">
                    {formatEuro(tipoCredito === 'habitacao' ? prestacaoHab : prestacaoPes)}
                  </span>
                </div>

                {tipoCredito === 'habitacao' && (
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-2">
                    <span className="text-sm font-semibold text-slate-700 block">Capital Inicial e Impostos (Estimados)</span>
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>Entrada Mínima ({100 - financiamentoPct}%):</span>
                      <span className="font-medium text-slate-900">{formatEuro(entradaMinima)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>IMT (Imposto Municipal s/ Transmissões){isencaoJovemLabel}:</span>
                      <span className="font-medium text-slate-900">{formatEuro(imtEstimadoFinal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>Imposto de Selo (Aquisição, {formatTaxaPct(tabelas.selo_aquisicao_imovel.taxa)}){isencaoJovemLabel}:</span>
                      <span className="font-medium text-slate-900">{formatEuro(isCompra)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>Imposto de Selo (Crédito, {formatTaxaPct(seloCreditoHab.taxa)}):</span>
                      <span className="font-medium text-slate-900">{formatEuro(isCreditoHab)}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between text-sm font-bold text-slate-900">
                      <span>Total Necessário (Fundo de Maneio):</span>
                      <span className="text-blue-600">{formatEuro(totalNecessario)}</span>
                    </div>
                  </div>
                )}

                {tipoCredito === 'pessoal' && (
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-2">
                    <span className="text-sm font-semibold text-slate-700 block">Impostos Iniciais</span>
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>Imposto do Selo (Utilização {formatTaxaPct(seloCreditoPes.taxa)}):</span>
                      <span className="font-medium text-slate-900">{formatEuro(isCreditoPes)}</span>
                    </div>
                  </div>
                )}

                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-2">
                  <span className="text-sm font-semibold text-slate-700 block">Análise de Esforço (DSTI - Máx. 45%)</span>
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Taxa de Esforço Atual:</span>
                    <span className={`font-bold ${dstiAtual <= 45 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {dstiAtual.toFixed(1)}%
                    </span>
                  </div>
                  {tipoCredito === 'habitacao' && regimeTaxaHab === 'variavel' && (
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>Teste de Stress (+1.5% Juro):</span>
                      <span className={`font-bold ${dstiStress <= 45 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {dstiStress.toFixed(1)}% ({formatEuro(prestacaoStressTotal)})
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-300 text-xs text-slate-500">
              * Valores simulados para efeitos indicativos com base nas normas do Banco de Portugal e enquadramento fiscal geral em vigor. Não dispensa a consulta de instituição de crédito autorizada.
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
