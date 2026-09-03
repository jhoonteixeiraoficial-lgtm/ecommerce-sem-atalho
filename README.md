# E-commerce Sem Atalho (ESA)

Plataforma completa de e-commerce com curso, comunidade, lives, IA e suporte.

## Stack

- Next.js 16.3.3 (App Router, Turbopack)
- React 19 + Tailwind CSS 4
- Supabase (Auth + PostgreSQL)
- Lucide React icons

## Estrutura

```
/
├── /login          # Login (sem sidebar)
├── /cadastro       # Cadastro (sem sidebar)
├── /onboarding     # Onboarding (sem sidebar)
├── /vsl            # Pagina de vendas VSL
├── /politicas      # Privacidade e Termos
└── /membros        # Area de membros (protegida)
    ├── /dashboard
    ├── /aulas
    ├── /comunidade
    ├── /lives
    ├── /materiais
    ├── /calendario
    ├── /acertive-ecom
    ├── /atualizacoes
    ├── /suporte
    └── /perfil
```

## Deploy no Vercel

1. Instale o Node.js 22+ (https://nodejs.org)
2. Abra o terminal na pasta do projeto
3. Rode: `npx vercel login`
4. Faca login no navegador
5. Rode: `npx vercel --prod`
6. Siga as instrucoes

## Desenvolvimento

```bash
npm install
npm run dev
```

Acesse: http://localhost:3000

## Notas

- Auth simulada com cookie (substituir por Supabase em producao)
- Middleware protege todas as rotas /membros/*
- Paginas de login/cadastro ficam publicas
- Design system: tema escuro com accent dourado (#c8a44e)
