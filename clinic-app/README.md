# Clinic Manager

Sistema de gestão de clínica (Next.js + Supabase): agendamento, cadastro de
pacientes com prontuário, financeiro e administração de usuários por
perfil (admin / médico / recepção).

## Setup

1. Crie um projeto no [Supabase](https://supabase.com).
2. Rode o script `supabase/schema.sql` no SQL editor do projeto.
3. Copie `.env.example` para `.env.local` e preencha com a URL e a anon key
   do projeto Supabase.
4. Instale as dependências e rode o app:

   ```bash
   pnpm install
   pnpm dev
   ```

5. Acesse `/signup` para criar a primeira conta. Por padrão, todo cadastro
   novo recebe o perfil `recepcao`. Promova o primeiro usuário a `admin`
   diretamente na tabela `profiles` pelo painel do Supabase para liberar o
   módulo de Administração.

## Estrutura

- `app/dashboard/patients` — cadastro de pacientes e prontuário
- `app/dashboard/appointments` — agendamento de consultas
- `app/dashboard/billing` — faturas e cobranças
- `app/dashboard/admin` — gestão de perfis/permissões (somente admin)
- `supabase/schema.sql` — schema do banco com RLS
