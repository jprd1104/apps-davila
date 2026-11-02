# Apps D'Ávila

Dois aplicativos independentes, instaláveis no celular e no computador:

- **Autos da Defensoria** (`cronograma/`): o cronograma dia a dia até dez/2028, questões pelo Claude, caderno de erros, edital e desempenho.
- **Biblioteca D'Ávila** (`biblioteca/`): o acervo de 397 livros, com plano diário de leitura.

Funcionam offline. Sem o Firebase configurado, cada aparelho guarda os próprios dados ("modo local"). Com o Firebase, tudo sincroniza.

## 1. Publicar (GitHub Pages, grátis)

1. Crie uma conta em github.com.
2. No claude.ai, conecte o GitHub (Configurações → Conectores → GitHub) e me avise. Eu crio o repositório `apps-davila`, envio os arquivos e ligo o GitHub Pages.
3. O endereço fica assim: `https://SEU-USUARIO.github.io/apps-davila/`

## 2. Sincronizar (Firebase, grátis)

1. Entre em console.firebase.google.com com sua conta Google e clique em **Criar projeto**. Nome: `apps-davila`. Pode desligar o Google Analytics.
2. **Authentication** → Começar → em "Provedores de login", ative **Google** e **E-mail/senha**.
3. **Authentication** → Configurações → **Domínios autorizados** → Adicionar domínio: `SEU-USUARIO.github.io`.
4. **Firestore Database** → Criar banco de dados → local `southamerica-east1 (São Paulo)` → modo de produção.
5. **Firestore** → aba **Regras** → apague tudo, cole o conteúdo do arquivo `firestore.rules` e clique em Publicar.
6. **Configurações do projeto** (engrenagem) → Seus apps → ícone `</>` (Web) → apelido `apps` → Registrar. Copie o bloco `firebaseConfig` e me mande. Esse bloco não é senha; ele só identifica o projeto. Quem protege os dados são as regras do passo 5.

## 3. Instalar no celular

- **iPhone:** abra o endereço no Safari → botão Compartilhar → **Adicionar à Tela de Início**. Faça isso para os dois apps.
- **Android:** abra no Chrome → menu ⋮ → **Instalar app**.
- **Computador:** no Chrome, ícone de instalar na barra de endereço.

Na primeira vez em que entrar com a conta, a Biblioteca importa sozinha os 397 livros.
