# Simulador Lite

Simulador de Crédito (Habitação e Pessoal) com análise de DSTI e Teste de Stress, alinhado com as normas do Banco de Portugal e fiscalidade portuguesa. Projeto React + Vite + Tailwind CSS v4.

Parte da suite [Soluções Eficazes](https://solucoeseficazes.pt).

## Desenvolvimento local

```bash
npm install
npm run dev
```

## Build de produção

```bash
npm run build
```

## Deploy

Deploy automático via GitHub Actions (`.github/workflows/deploy.yml`) para GitHub Pages a cada push para `main`.

Domínio próprio configurado via `public/CNAME` → `simulador-lite.solucoeseficazes.pt`, com o DNS gerido no Cloudflare (registo CNAME a apontar para `<utilizador>.github.io`).

### Passos para activar (uma vez, no GitHub)

1. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Pages → Custom domain: `simulador-lite.solucoeseficazes.pt` (o ficheiro `CNAME` já está no repo, mas o GitHub pede para confirmar na UI).
3. Aguardar a validação DNS e activar "Enforce HTTPS".
