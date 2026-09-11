# Guide d'installation — Robot copy-trading Gold (Telegram → IA → MT5)

Ce guide t'emmène de zéro jusqu'à un système qui tourne 24/7 sans que ton PC soit allumé.
Suis les phases dans l'ordre — chacune dépend de la précédente.

---

## Phase 1 — Créer le Bot Telegram

1. Ouvre Telegram, cherche **@BotFather** (le bot officiel, avec un badge vérifié bleu)
2. Envoie `/newbot`
3. Donne un nom (ex: `Gold Signal Reader`) puis un identifiant unique finissant par `bot` (ex: `gold_signal_reader_bot`)
4. BotFather te renvoie un **token** — une longue chaîne type `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   → **Copie-le et garde-le de côté**, tu en auras besoin en Phase 4

---

## Phase 2 — Mettre le code sur GitHub

1. Va sur [github.com](https://github.com), crée un compte si tu n'en as pas
2. Clique sur **New repository**, nomme-le `gold-signal-bridge`, laisse-le **Public** ou **Private** (les deux marchent), ne coche aucune case supplémentaire, clique **Create repository**
3. Sur ta page de dépôt vide, clique **uploading an existing file**
4. Glisse-dedans le dossier `vercel-bridge` que je t'ai donné (le contenu : `api/webhook.js`, `api/signals.js`, `package.json`)
5. Clique **Commit changes**

*(Si tu es à l'aise avec Git en ligne de commande, `git init`, `git add .`, `git commit`, `git push` marchent aussi — mais l'upload web suffit largement ici.)*

---

## Phase 3 — Déployer sur Vercel

1. Va sur [vercel.com](https://vercel.com), crée un compte en te connectant **avec ton compte GitHub** (plus simple, connecte automatiquement les deux)
2. Sur le tableau de bord Vercel, clique **Add New → Project**
3. Trouve `gold-signal-bridge` dans la liste de tes dépôts GitHub, clique **Import**
4. Laisse les réglages par défaut, clique **Deploy**
5. Au bout de 30-60 secondes, Vercel te donne une URL, du type :
   `https://gold-signal-bridge.vercel.app`
   → **Note cette URL**, tu en auras besoin partout ensuite

---

## Phase 4 — Activer la base de données (Supabase, gratuit)

1. Va sur [supabase.com](https://supabase.com), crée un compte (tu peux te connecter avec GitHub)
2. Clique **New Project**, donne-lui un nom (ex: `gold-signal-bridge`), choisis un mot de passe pour la base (garde-le de côté), choisis une région proche de toi, clique **Create new project** — patiente 1-2 minutes pendant la création
3. Une fois le projet prêt, va dans l'onglet **SQL Editor** (menu de gauche), clique **New query**, colle ce code puis clique **Run** :

   ```sql
   create table signals (
     id bigint generated always as identity primary key,
     msg_id bigint,
     created_at timestamptz default now(),
     symbol text,
     action text,
     entry numeric,
     sl numeric,
     tp jsonb,
     parsed_by text
   );
   ```

   → ça crée la table qui stockera les signaux
4. Va dans **Project Settings → API** (icône engrenage en bas à gauche)
5. Note deux valeurs, tu en auras besoin en Phase 5 :
   - **Project URL** (ressemble à `https://xxxxx.supabase.co`)
   - **service_role key** (sous "Project API keys" — ⚠️ c'est une clé secrète, ne la partage jamais publiquement, ne la mets jamais dans du code visible côté navigateur)

---

## Phase 5 — Configurer les variables d'environnement

1. Dans ton projet Vercel → **Settings → Environment Variables**
2. Ajoute ces variables (une par une, bouton **Add**) :

   | Nom | Valeur | Obligatoire ? |
   |---|---|---|
   | `SUPABASE_URL` | la "Project URL" notée en Phase 4 | Oui |
   | `SUPABASE_SERVICE_KEY` | la "service_role key" notée en Phase 4 | Oui |
   | `API_SECRET` | invente un mot de passe complexe (ex: `g0ld_x7Kp!9qL`) | Oui |
   | `WEBHOOK_SECRET` | invente un autre mot de passe | Oui |
   | `AI_API_KEY` | ta clé d'un fournisseur d'IA à plan gratuit (ex: Groq — crée un compte sur leur site, section API Keys) | Optionnel (sans elle, le fallback IA est juste désactivé, seul le parseur par règles fonctionne) |

3. Après avoir ajouté les variables, va dans l'onglet **Deployments**, clique sur les `...` du dernier déploiement → **Redeploy** (pour que les nouvelles variables soient prises en compte)

---

## Phase 6 — Connecter le Bot au Webhook

1. Dans ton navigateur, colle cette URL en remplaçant les 3 éléments entre `< >` par tes vraies valeurs :

   ```
   https://api.telegram.org/bot<TON_TOKEN_BOTFATHER>/setWebhook?url=https://gold-signal-bridge.vercel.app/api/webhook?secret=<TON_WEBHOOK_SECRET>
   ```

2. Appuie sur Entrée. Tu dois voir une réponse JSON avec `"ok":true`
   → Si tu vois `"ok":true`, le bot est branché. Si erreur, revérifie le token et l'URL.

---

## Phase 7 — Ajouter le Bot au groupe privé

1. Ouvre le groupe Telegram où arrivent les signaux
2. Ajoute ton bot (`@gold_signal_reader_bot` ou le nom que tu lui as donné) comme membre, comme tu ajouterais n'importe quel contact
3. **Important** : si le groupe est en mode "privacy" strict, le bot ne voit que les messages qui le mentionnent ou les commandes. Pour qu'il voie **tous** les messages : reparle à @BotFather → `/mybots` → sélectionne ton bot → **Bot Settings → Group Privacy → Turn off**

---

## Phase 8 — Tester le pipeline (sans MT5 pour l'instant)

1. Envoie un message test dans le groupe, format standard, par exemple :
   `BUY GOLD @2650 SL 2640 TP 2660 TP 2670`
2. Va dans ton projet Vercel → onglet **Logs** (ou **Deployments → dernier déploiement → Functions**)
3. Tu dois voir une ligne `Signal stocke: {...}` avec les bonnes valeurs extraites
4. Vérifie que l'endpoint fonctionne : dans ton navigateur, va sur
   `https://gold-signal-bridge.vercel.app/api/signals?since=0&key=<TON_API_SECRET>`
   → tu dois voir une ligne texte du type `1|XAUUSD|BUY|2650|2640|2660|2670`

Si ces deux vérifications passent, **le cloud est prêt**. La suite concerne MT5.

---

## Phase 9 — Louer un VPS pour MT5

MT5 doit tourner en continu quelque part — ça ne peut pas être Vercel (voir explication précédente).

- **Option A** : demande à Exness s'ils offrent un VPS gratuit pour ton type de compte (certains brokers le font sous conditions d'activité) — vérifie directement dans ton espace client Exness ou avec leur support, ces conditions changent
- **Option B** : loue un VPS Windows chez un hébergeur généraliste (quelques $/mois) — cherche "VPS Windows pas cher" et compare, je n'ai pas d'info fiable et à jour sur les prix actuels pour te recommander un fournisseur précis

Une fois le VPS actif : connecte-toi dessus (Remote Desktop), installe MetaTrader 5 dessus comme sur un PC normal, connecte-toi à ton compte Exness.

---

## Phase 10 — Installer l'EA sur le VPS

1. Dans MT5 (sur le VPS) → `Fichier → Ouvrir le dossier des données → MQL5 → Experts`
2. Copie `Gold_Signal_Copier_EA_Cloud.mq5` dedans
3. Redémarre MT5 ou clic droit sur "Experts" dans le navigateur → **Actualiser**
4. `Outils → Options → Expert Advisors` → coche **"Autoriser WebRequest pour les URL listées"** → clique **Ajouter** → colle `https://gold-signal-bridge.vercel.app` (sans `/api/...`, juste le domaine) → OK
5. Ouvre un graphique **XAUUSD**, glisse l'EA dessus
6. Dans les paramètres de l'EA :
   - `InpApiBaseUrl` = `https://gold-signal-bridge.vercel.app/api/signals`
   - `InpApiSecret` = ton `API_SECRET` (le même que dans Vercel)
7. Coche "Autoriser le trading algorithmique", clique OK
8. Vérifie l'onglet **Experts** en bas de MT5 : tu dois voir `Gold_Signal_Copier_EA_Cloud demarre. API : ...`

---

## Phase 11 — Test réel

1. Assure-toi d'être en **compte démo** dans MT5
2. Envoie à nouveau un signal test dans le groupe Telegram
3. Regarde l'onglet **Experts** de MT5 : tu dois voir apparaître `Signal #X execute au marche` en quelques secondes
4. Vérifie l'onglet **Trade** : une position doit s'ouvrir avec le bon SL/TP

Si tout ça fonctionne, le système tourne désormais indépendamment de ton PC — tu peux l'éteindre.

---

## En cas de blocage

- **Le bot ne reçoit rien** → revérifie Phase 7 (privacy mode du bot) et Phase 6 (webhook bien enregistré)
- **`WebRequest bloque` dans les logs MT5** → revérifie Phase 10 étape 4 (URL bien ajoutée, sans faute de frappe, avec `https://`)
- **Rien dans les logs Vercel** → le webhook n'est peut-être pas bien enregistré, refais Phase 6 et vérifie la réponse JSON
