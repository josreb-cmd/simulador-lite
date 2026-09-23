import { useState } from 'react';

// Formata valores monetários com separador de milhares em formato PT-PT (ex: 8.680,00 €)
// Nota: usa formatação manual em vez de toLocaleString('pt-PT'), porque essa locale só
// agrupa milhares quando o primeiro grupo tem 2+ dígitos (ex: 20000 e 28680 ficam bem,
// mas 8680 ficaria "8680,00" sem separador). Esta versão agrupa sempre, de forma consistente.
const formatEuro = (valor: number): string => {
  const negativo = valor < 0;
  const [parteInteira, parteDecimal] = Math.abs(valor).toFixed(2).split('.');
  const inteiraComSeparador = parteInteira.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${negativo ? '-' : ''}${inteiraComSeparador},${parteDecimal} €`;
};

export default function App() {
  const [tipoCredito, setTipoCredito] = useState<'habitacao' | 'pessoal'>('habitacao');

  // Inputs Habitação
  const [valorImovel, setValorImovel] = useState<number>(200000);
  const [financiamentoPct, setFinanciamentoPct] = useState<number>(90);
  const [prazoHabitacao, setPrazoHabitacao] = useState<number>(30); // anos
  const [regimeTaxaHab, setRegimeTaxaHab] = useState<'fixa' | 'variavel'>('fixa');
  const [tanHabitacao, setTanHabitacao] = useState<number>(3.5); // % (usado no regime Fixa)
  const [euribor, setEuribor] = useState<number>(2.5); // % (usado no regime Variável)
  const [spread, setSpread] = useState<number>(1.0); // % (usado no regime Variável)
  
  // Inputs Pessoal
  const [montantePessoal, setMontantePessoal] = useState<number>(10000);
  const [prazoPessoal, setPrazoPessoal] = useState<number>(60); // meses
  const [tanPessoal, setTanPessoal] = useState<number>(8.5); // %

  // Inputs Comuns
  const [rendimentoLiquido, setRendimentoLiquido] = useState<number>(2500);
  const [outrosEncargos, setOutrosEncargos] = useState<number>(0);

  // Cálculos Habitação
  const tanHabitacaoEfetiva = regimeTaxaHab === 'variavel' ? euribor + spread : tanHabitacao;
  const valorFinanciadoHab = valorImovel * (financiamentoPct / 100);
  const entradaMinima = valorImovel - valorFinanciadoHab;
  const mesesHab = prazoHabitacao * 12;
  const iHab = (tanHabitacaoEfetiva / 100) / 12;
  const prestacaoHab = iHab === 0 
    ? valorFinanciadoHab / mesesHab 
    : (valorFinanciadoHab * (iHab * Math.pow(1 + iHab, mesesHab))) / (Math.pow(1 + iHab, mesesHab) - 1);

  // Teste de Stress BdP (+1.5% na TAN) — obrigatório apenas para taxa variável
  const iStress = ((tanHabitacaoEfetiva + 1.5) / 100) / 12;
  const prestacaoStress = iStress === 0 
    ? valorFinanciadoHab / mesesHab 
    : (valorFinanciadoHab * (iStress * Math.pow(1 + iStress, mesesHab))) / (Math.pow(1 + iStress, mesesHab) - 1);

  // Cálculo do IMT — tabela oficial de escalões para Habitação Própria Permanente (HPP),
  // Portugal Continental (OC AT 40129/2026). Base: valor do imóvel (ou VPT, se superior).
  const calcularIMT = (valor: number): number => {
    if (valor <= 106346) return 0;
    if (valor <= 145470) return valor * 0.02 - 2126.92;
    if (valor <= 198347) return valor * 0.05 - 6491.02;
    if (valor <= 330539) return valor * 0.07 - 10457.96;
    if (valor <= 660982) return valor * 0.08 - 13763.35;
    if (valor <= 1150853) return valor * 0.06; // taxa única, sem parcela a abater
    return valor * 0.075; // taxa única, sem parcela a abater
  };

  // Impostos Habitação
  const isCreditoHab = valorFinanciadoHab * 0.006; // Imposto do Selo sobre o crédito — 0.6% para prazo > 5 anos
  const isCompra = valorImovel * 0.008; // Imposto do Selo sobre a aquisição — 0.8%
  const imtEstimadoFinal = Math.max(0, calcularIMT(valorImovel));
  const totalImpostosHab = isCreditoHab + isCompra + imtEstimadoFinal;
  const totalNecessario = entradaMinima + totalImpostosHab;

  // Cálculos Pessoal
  const mesesPes = prazoPessoal;
  const iPes = (tanPessoal / 100) / 12;
  const prestacaoPes = iPes === 0 
    ? montantePessoal / mesesPes 
    : (montantePessoal * (iPes * Math.pow(1 + iPes, mesesPes))) / (Math.pow(1 + iPes, mesesPes) - 1);
  const isCreditoPes = montantePessoal * 0.0176; // 1.76% para prazo > 5 anos

  // Taxa de Esforço (DSTI)
  const prestacaoAtiva = tipoCredito === 'habitacao' ? prestacaoHab : prestacaoPes;
  const dstiAtual = ((prestacaoAtiva + outrosEncargos) / rendimentoLiquido) * 100;
  
  const prestacaoStressTotal = tipoCredito === 'habitacao' ? prestacaoStress + outrosEncargos : prestacaoAtiva + outrosEncargos;
  const dstiStress = (prestacaoStressTotal / rendimentoLiquido) * 100;

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
                  <input 
                    type="number" 
                    value={valorImovel} 
                    onChange={(e) => setValorImovel(Number(e.target.value))}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
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
                  <input 
                    type="number" 
                    min="5" 
                    max="40" 
                    value={prazoHabitacao} 
                    onChange={(e) => setPrazoHabitacao(Number(e.target.value))}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
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
                    <input 
                      type="number" 
                      step="0.1" 
                      value={tanHabitacao} 
                      onChange={(e) => setTanHabitacao(Number(e.target.value))}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <span className="text-xs text-slate-500">Taxa fixa durante todo o prazo — sem obrigatoriedade de teste de esforço regulamentar.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">Euribor (%)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        value={euribor} 
                        onChange={(e) => setEuribor(Number(e.target.value))}
                        className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">Spread (%)</label>
                      <input 
                        type="number" 
                        step="0.1" 
                        value={spread} 
                        onChange={(e) => setSpread(Number(e.target.value))}
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
                  <input 
                    type="number" 
                    value={montantePessoal} 
                    onChange={(e) => setMontantePessoal(Number(e.target.value))}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Prazo (Meses)</label>
                    <input 
                      type="number" 
                      min="12" 
                      max="84" 
                      value={prazoPessoal} 
                      onChange={(e) => setPrazoPessoal(Number(e.target.value))}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">TAN (%)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      value={tanPessoal} 
                      onChange={(e) => setTanPessoal(Number(e.target.value))}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="border-t pt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Rendimento Líquido Mensal Familiar (€)</label>
                <input 
                  type="number" 
                  value={rendimentoLiquido} 
                  onChange={(e) => setRendimentoLiquido(Number(e.target.value))}
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Outros Créditos / Encargos Atuais (€/mês)</label>
                <input 
                  type="number" 
                  value={outrosEncargos} 
                  onChange={(e) => setOutrosEncargos(Number(e.target.value))}
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
                      <span>IMT (Imposto Municipal s/ Transmissões):</span>
                      <span className="font-medium text-slate-900">{formatEuro(imtEstimadoFinal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>Imposto de Selo (Aquisição, 0,8%):</span>
                      <span className="font-medium text-slate-900">{formatEuro(isCompra)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>Imposto de Selo (Crédito, 0,6%):</span>
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
                      <span>Imposto do Selo (Utilização 1,76%):</span>
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