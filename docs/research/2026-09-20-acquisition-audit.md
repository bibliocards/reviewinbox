# ReviewInbox — audit acquisition et activation

Audit du 20 septembre 2026. Référence locale : `d7b7261`. Rapport de décision, sans modification du produit ni publication externe.

## Décision proposée

Donner à ReviewInbox un test commercial borné, en corrigeant d'abord le premier usage, puis en distribuant une proposition plus précise. Les captures Search Console ne permettent ni de rejeter le produit, ni de conclure qu'il existe une demande solvable. Le problème observable est une exposition Google très faible ; le code révèle aussi des obstacles qui rendraient un test d'acquisition difficile à interpréter.

L'ordre recommandé : **premier résultat fiable → mesure → démonstration et confiance → recrutement ciblé → contenus SEO utiles → décision sur la suite**. Ne pas attendre un site parfait pour commencer les conversations avec des utilisateurs potentiels.

| Priorité | Actions | Résultat recherché |
| --- | --- | --- |
| P0 | A01 premier import, A02 état vide Google, A03 récupération, A04 liens d'installation, A05 guides de connexion, A06 mesure, A17 cohérence IA | Un essai interprétable, sans impasse évidente |
| P1 | A07 cible, A08 landing/démo, A09 cas Bibliocards, A10 confiance, A11 offre, A12 Cloud/self-hosted, A13 indexation, A15 recrutement, A18 contexte, A19 reprise | Acquérir et activer les bonnes personnes |
| P1/P2 | A14 contenus progressifs ; petits ajustements SEO techniques | Construire la découvrabilité dans la durée |
| P2 conditionnel | A16 outil gratuit, import historique CSV selon retours | Répondre à une demande observée |

P0 signifie « avant une amplification de l'acquisition », pas incident de production avéré pour chaque ligne. Les observations live, les faits de code et les hypothèses sont distingués ci-dessous.

## Périmètre et niveau de preuve

- Captures fournies : recherche Web, trois mois, 96 impressions, 6 clics, CTR 6,3 %, position moyenne 25,9 ; cinq requêtes affichées, toutes à zéro clic.
- Site public consulté : accueil, tarifs ; navigateur anonyme : inscription, connexion et lien de récupération.
- Code inspecté : site Astro, routes Angular, connexion des stores, worker, quotas, événements d'usage, facturation et documentation.
- Recherche concurrentielle : voir [note de marché](2026-09-20-acquisition-market.md), avec sources primaires et réserves.
- Pas d'accès utilisé aux données privées Search Console, analytics, base de production, ventes ou infrastructure. Pas de nouveau compte, connexion de store, publication d'avis ou paiement effectué.
- Une implémentation dans le code ne prouve pas son bon fonctionnement en production. Les constats de fonctionnement après inscription sont statiques, sauf indication contraire.
- Certaines lectures automatisées de robots/sitemap ont rencontré des refus de l'outil/client ; une lecture HTTP réussie a ensuite confirmé le sitemap et ses cinq URL. Aucun blocage d'exploration n'a été établi. Le contrôle Search Console reste à réaliser.
- L'API publique `/api/client-config` confirme en live le mode Cloud, les inscriptions ouvertes, la synchronisation automatique déclarée active avec étalement de 60 minutes, les trois plans payants listés et l'envoi d'invitations email déclaré désactivé. Ce dernier point mérite vérification avant de cibler les équipes ; cette réponse ne mesure pas la santé réelle du worker ou de Stripe.

## Ce que les captures permettent de dire

Six clics ne constituent pas un échantillon exploitable pour arbitrer la conversion. La position moyenne agrège des requêtes, pages, appareils et contextes différents : ce n'est pas un classement unique à améliorer. Les cinq requêtes visibles évoquent notamment des boîtes email et ReachInbox, donc ne montrent pas une forte correspondance avec le besoin mobile.

Il ne faut pas attribuer les six clics à ces cinq lignes, puisqu'elles affichent zéro clic. Les tableaux Search Console peuvent omettre des requêtes, notamment anonymisées. Vérifier filtres, propriété, dates et export avant toute réconciliation. Source : [documentation du rapport de performance](https://support.google.com/webmasters/answer/7576553).

À obtenir pour la décision : visiteurs et provenance tous canaux, inscriptions externes, Organizations créées, stores connectés avec succès, premiers avis importés, premières publications, retours utiles, paiements. Exclure les essais internes et distinguer Bibliocards des utilisateurs indépendants.

## Actions avant d'amplifier l'acquisition

### A01 — Obtenir un premier import pendant la première session — P0

**Constat code.** `apps/api/src/routes/apps.ts:251` termine la connexion sans mettre un premier import en file ; `apps/web/src/app/pages/apps/apps.page.ts:90` recharge la liste. Free interdit la synchronisation manuelle (`packages/billing/src/plans.ts:53`). Le worker planifie des fenêtres à 00, 06, 12 et 18 h UTC (`packages/config/src/index.ts:25`, `:227`), avec un étalement configurable, une heure par défaut. Une connexion sans historique est éligible à la prochaine fenêtre (`apps/worker/src/main.ts:215`).

**Conséquence déduite.** Le premier import peut attendre presque six heures, plus l'étalement et la file, si le worker fonctionne avec cette configuration. L'intervalle de 24 h de Free concerne ensuite les synchronisations ; ce n'est pas un délai initial fixe de 24 h. Sans worker actif, ce parcours ne fournit pas de premier import automatique.

**Action.** Enqueue d'un import initial après validation de la connexion, y compris Free, idempotent et dans les quotas. Afficher progression, succès, absence d'avis et échec avec une action utile. Ne pas rendre toutes les synchronisations Free illimitées pour résoudre ce cas.

**Acceptation.** Une connexion valide met exactement un import initial en file ; rechargement/retry ne duplique pas le travail ; succès, zéro avis, quota et erreur sont distingués. Mesurer le délai réel jusqu'au premier avis éligible. Objectif proposé : résultat pendant la session, sans le promettre publiquement avant mesure.

### A02 — Traiter le cas Google Play sans avis récents — P0

L'API Google expose les avis commentés créés ou modifiés dans la dernière semaine, pour les versions de production. Un store valide peut donc renvoyer zéro avis. Source : [Google Reply to Reviews](https://developers.google.com/android-publisher/reply-to-reviews).

Le message vide actuel conseille de synchroniser depuis Apps (`apps/web/public/i18n/en.json:199`), même lorsque Free ne permet pas cette action. Le README mentionne le CSV historique mais aucun parcours d'import CSV n'a été identifié dans les routes/UI inspectées : ne pas présenter cet import comme disponible dans ReviewInbox.

**Action immédiate.** Expliquer la fenêtre Google avant connexion et dans l'état vide ; différencier filtre vide, absence de connexion, attente d'import, absence d'avis éligibles, quota et erreur. Proposer une démonstration avec données clairement identifiées comme exemples, sans la compter comme activation réelle.

**Action conditionnelle.** Développer l'import historique CSV si les premiers essais confirment que ce blocage est fréquent. L'existence d'un export Google ne suffit pas à rendre sa réimportation dans le produit triviale.

### A03 — Réparer la récupération de compte — P0

**Constat live.** Sur la connexion Cloud, cliquer sur « password » dans « Forgot your email or password? » revient à la connexion sans formulaire de récupération.

**Constat code.** Les liens existent (`apps/web/src/app/pages/auth/login/login.page.html:120`), mais aucune route `forgot-password` n'est déclarée et la route inconnue redirige vers l'accueil (`apps/web/src/app/app.routes.ts:63`). La configuration email/password ne définit pas de callback d'envoi de récupération (`apps/api/src/auth.ts:67`).

**Action.** Un vrai parcours demande → email → nouveau mot de passe → connexion, puis vérification de la livraison email. Corriger aussi le libellé « email » qui pointe vers la même destination. L'email de récupération ne doit pas révéler l'existence d'un compte.

### A04 — Réparer le démarrage self-hosted — P0, petit correctif

Les deux URL `raw.githubusercontent.com/reviewinbox/reviewinbox/main/...` de la procédure renvoient 404 lors du contrôle. Le dépôt public `bibliocards/reviewinbox` répond. Les mauvaises URL sont répétées dans `README.md:46`, `docs/self-hosting.md:27` et `apps/site/src/content/docs/docs/self-hosting.md:30`.

**Action.** Corriger la source des téléchargements aux trois endroits et tester la procédure sur une installation vierge avec version d'image publiée et explicite. Ajouter une vérification des liens de démarrage. Un GET 200 sur le YAML ne remplace pas ce test d'installation.

### A05 — Accompagner les autorisations store — P0

Le formulaire demande les identifiants Apple, la clé privée et le JSON de compte de service Google, sans guide contextuel visible dans le template (`apps/web/src/app/shared/components/connect-app-dialog/connect-app-dialog.component.html:53`). La documentation publique identifiée est surtout consacrée à l'hébergement et aux quotas.

**Action.** Un guide illustré par store, lié au champ pertinent : prérequis, où trouver chaque valeur, permissions nécessaires vérifiées dans la documentation du fournisseur, test de connexion, erreurs fréquentes et révocation. Proposer de choisir d'abord le store à connecter plutôt que d'afficher deux ensembles de champs techniques.

**Acceptation.** Un développeur extérieur accomplit la connexion sans assistance du fondateur et sait distinguer absence de permission, identifiant incorrect et absence d'avis.

### A06 — Mesurer avant de distribuer davantage — P0

Des événements opérationnels existent déjà : imports (`packages/sync/src/review-storage.ts:119`), brouillons IA managés (`packages/reply-drafts/src/generate-reply-draft-for-review.ts:202`, uniquement dans le mode `managed`, voir A17), publications (`apps/api/src/routes/reply-inbox.ts:474`). Ils ne forment pas un funnel d'acquisition. Aucun SDK analytics ou traitement UTM identifié dans les surfaces inspectées ; une instrumentation injectée extérieurement reste possible.

**Action.** Réutiliser les faits serveur ; ajouter l'attribution et les étapes manquantes. Ne pas modifier le sens des Usage Events de facturation pour en faire de l'analytics. Stocker des événements produit séparés ou construire une projection dédiée.

| Étape | Définition et mesure |
| --- | --- |
| Visite attribuée | Landing, referrer, campagne autorisée ; exclure robots et visites internes autant que possible |
| Visite qualifiée | Visiteur identifié par le canal ou l'entretien comme responsable d'une app publiée ; une simple page vue ne le prouve pas |
| Inscription | Création réussie, pas clic sur le CTA |
| Organization créée | Étape supplémentaire explicite du parcours Cloud |
| Store connecté | Validation réussie ; ventiler Apple/Google et catégories d'échec |
| Premier import | Premier avis réellement stocké ; distinguer sync réussie à zéro avis |
| Première valeur | Premier brouillon examiné/édité ou premier avis traité ; garder la publication comme étape distincte |
| Première publication | Succès confirmé côté serveur/store, jamais simple clic |
| Retour utile | Nouvelle session avec action utile, à J7/J30 et en tenant compte de l'arrivée de nouveaux avis |
| Paiement | Abonnement actif confirmé par le traitement serveur, jamais page de retour seule |

Conserver l'attribution entre le site et `cloud.reviewinbox.app`, puis à travers inscription et création d'Organization. Dénominateur commercial : Organizations externes uniques, pas membres invités. Dédupliquer retries, distinguer Free/payant, stores et cohortes ; exclure données de démo et usages internes. Ne pas envoyer textes d'avis, Store Credentials ou contenu de brouillons dans les événements analytics.

À faible volume, afficher les nombres bruts à côté des taux. Observer chaque abandon connu plutôt que lancer des A/B tests sous-alimentés.

## Positionnement, démonstration et confiance

### A07 — Choisir une cible ayant effectivement le problème — P1

Hypothèse prioritaire : développeur indépendant ou petite équipe avec une app publiée, des avis récurrents et un besoin de répondre ; les deux stores renforcent le bénéfice mais ne doivent pas être une obligation artificielle. Une app sans nouveaux avis ou dont le responsable ne répond jamais a peu de raisons de revenir.

Comparer deux sous-groupes dans les premiers entretiens : faible volume avec manque de temps ; plusieurs apps/stores avec changements de contexte fréquents. Noter la fréquence des avis, le processus actuel, les réponses en attente, le responsable, les langues et les raisons de payer. Ne pas présumer que « indie » implique automatiquement un besoin solvable.

Proposition de texte anglais, à tester :

> App Store and Google Play reviews, in one inbox.
> Draft replies with AI, edit them, and publish when you're ready.

Une fois le contexte configurable livré (A18), le démontrer : consigne support ou incident connu → brouillon → correction humaine → publication. Avant cela, ne pas présenter ce scénario comme accessible au nouvel utilisateur. La centralisation, l'IA et le contrôle humain ne sont pas exclusifs à ReviewInbox. L'open source, l'hébergement au choix et une offre simple constituent un angle à tester, pas une supériorité démontrée.

Conserver le glossaire dans le modèle et la documentation de référence ; simplifier les phrases commerciales sans rebaptiser les concepts en termes ambigus. Éviter notamment « without mutating workflow state », actuellement visible dans le workflow de l'accueil.

### A08 — Réorganiser la landing autour du premier usage — P1

Une capture réelle est déjà présente, en AVIF avec fallback PNG (`apps/site/src/pages/index.astro:191`). Ne pas planifier sa création comme si elle manquait.

Ordre proposé : bénéfice et stores → démonstration → étapes pratiques et prérequis → preuve Bibliocards → prix et limites compréhensibles → FAQ et confiance. CTA principal « Start free », secondaire « Watch the workflow » ou démonstration ; self-hosting reste accessible via une entrée dédiée.

Créer une courte séquence commentée couvrant avis réel anonymisé, contexte, génération, édition, publication. Préciser les données d'exemple et ne pas réaliser une publication publique uniquement pour filmer une démo. Montrer aussi l'effort de connexion et les limites d'historique. Sur mobile, vérifier réellement lisibilité de la capture, navigation, tarifs et CTA au lieu d'inférer la qualité responsive depuis les classes CSS.

Le code masque la navigation principale avant le breakpoint `md` sans menu mobile (`apps/site/src/pages/index.astro:157`, `pricing.astro:112`). Les liens du pied de page existent encore ; rendre les accès importants plus visibles est un petit ajustement, pas une refonte complète.

### A09 — Transformer Bibliocards en preuve vérifiable — P1

Écrire un cas interne explicitement présenté comme celui du fondateur : besoin, stores réellement utilisés, rythme observé, deux ou trois exemples anonymisés, rôle du Reply Context, modifications humaines, limites rencontrées. Ne pas le présenter comme un client indépendant.

Mesurer avant toute affirmation : temps de traitement sur quelques sessions, part des brouillons retouchés, avis traités, erreurs de publication et fréquence de retour. Sans historique fiable, publier un récit de workflow sans pourcentage de gain ni effet sur les ventes ou les notes.

### A10 — Rendre le service digne de recevoir des accès store — P1

Aucun lien de contact, de confidentialité ou de conditions n'est présent dans les pieds de page marketing inspectés. L'argument open source ne renvoie pas directement au dépôt depuis l'accueil ; le lien est dans la documentation.

Afficher un interlocuteur, un canal d'aide, le dépôt et la licence, le statut du produit et une page factuelle sur les données : qui opère le service, hébergement vérifié, sous-traitants IA réellement configurés, données transmises, conservation/suppression et révocation des accès. Publier les informations contractuelles et de confidentialité appropriées après validation des faits. Ceci est un constat de transparence commerciale, pas un audit de conformité juridique.

Ne pas annoncer de certification, de région d'hébergement, d'absence d'entraînement IA ou de garantie de sauvegarde sans preuve de configuration et de conditions fournisseurs.

## Offre et monétisation

### A11 — Clarifier Free et les plans avant de modifier les prix — P1

Les tarifs publics sont Free, Starter 9,99 USD/mois, Pro 29,99 et Business 99,99. Le tableau présente les volumes mais pas les différences de synchronisation et BYOK, pourtant implémentées dans `packages/billing/src/plans.ts`. [Tarifs publics](https://reviewinbox.app/pricing/).

Afficher fréquence de synchronisation, premier import, limites historiques, absence de synchro manuelle Free, quota IA et possibilité d'éditer manuellement. Retirer de la comparaison principale les packs « planned » qui ne sont pas achetables. Expliquer ce qui se passe au plafond, comment changer de plan et gérer l'abonnement. Ne pas créer de facturation supplémentaire uniquement pour embellir cette page.

Le chargement initial de 30 avis déjà existants peut épuiser le quota Free : tous les premiers imports comptent (`packages/sync/src/review-storage.ts:49`). Deux stores partagent le budget d'une même Organization. Une fois le quota IA réellement raccordé (A17), vérifier aussi si les cinq brouillons sont consommés par l'auto-génération avant que l'utilisateur ait choisi les avis qui l'intéressent. Tester ces scénarios puis décider entre échantillon, quota de démarrage distinct ou priorisation ; ne pas changer les quotas à l'aveugle.

Stripe est bien présent dans le code (`apps/api/src/auth.ts:82`), contrairement à certaines notes anciennes du dépôt. Tester séparément checkout, webhook, activation des droits, annulation et portail avant d'affirmer que le paiement fonctionne en production. Pas de transaction réalisée pendant cet audit.

Mesurer également l'économie du service avant promotions ou publicité : coût IA réel par brouillon réussi et par retry, infrastructure, email, frais de paiement et temps d'accompagnement par Organization activée. Comparer coût des utilisateurs Free et revenu net des payants. À 9,99 USD/mois affichés, un onboarding qui exige beaucoup d'assistance peut rendre une acquisition apparemment réussie coûteuse ; c'est un risque à mesurer, pas une conclusion sur la marge actuelle. Ne pas baisser les prix tant que valeur, activation et coût de service ne sont pas connus.

### A12 — Séparer succès open source et succès commercial — P1

Self-hosted : mesurer intérêt pour la documentation et retours volontaires sur l'installation, sans télémétrie cachée. Cloud : mesurer activation, retour et abonnement. Des étoiles GitHub ne sont pas des abonnements ; un utilisateur satisfait en self-hosted n'est pas un échec de conversion Cloud.

Clarifier la valeur payante de l'hébergement géré à partir de ce qui est réellement opéré. Ne pas centrer toute la landing sur un choix d'infrastructure avant que le visiteur ait compris le produit.

## SEO : vérifier l'exploration, puis répondre à des besoins précis

### A13 — Contrôles techniques utiles — P1

L'accueil contient du HTML lisible, un titre, une description, une canonical, `index, follow`, un H1 et des données SoftwareApplication. Ce sont de bonnes bases ; elles ne prouvent pas l'indexation. [Accueil public](https://reviewinbox.app/).

Contrôler dans Search Console les URL exactes : canonical choisie, dernière exploration, statut d'indexation, sitemap traité et éventuelles exclusions. Le [sitemap live](https://reviewinbox.app/sitemap-0.xml) contient bien cinq URL : accueil, tarifs et trois pages de documentation. Toutes les URL du sitemap ont répondu 200 lors de l'audit délégué ; cela ne prouve pas leur indexation.

Améliorations légères : titre/description orientés stores et usage, image Open Graph/Twitter absente de l'accueil et des tarifs inspectés, liens cohérents au dépôt et maillage entre contenu, démonstration et essai. Le `meta keywords` et `llms.txt` ne sont pas les priorités de ce sprint.

Mesurer performance mobile et Core Web Vitals disponibles ; aucun score Lighthouse ni données terrain n'a été produit ici. Ne pas présenter les performances comme un blocage établi. Ne pas consacrer le sprint à obtenir un score parfait sans problème utilisateur observé.

Hygiène secondaire : uniformiser canonical et slash final ; contrôler le balisage SoftwareApplication sans inventer de notes clients ni promettre un résultat enrichi ; ne pas ajouter du schéma partout sans usage. Séparer l'indexation marketing des écrans Cloud de connexion : le Cloud ne contient pas de `noindex` dans `apps/web/src/index.html` et son `/robots.txt` renvoie le shell HTML par fallback Nginx. Prévoir une réponse robots correcte et une politique explicite pour les écrans d'authentification. Pour que Google lise `noindex`, ne pas bloquer simultanément l'exploration de ces pages : [documentation Google](https://developers.google.com/search/docs/crawling-indexing/block-indexing). Aucun problème de classement causé par ce point n'est démontré.

### A14 — Produire peu de pages, avec une utilité distincte — P1/P2

Les pistes ci-dessous sont des hypothèses d'intention, pas des mots-clés à volume certifié. Inspecter les résultats de recherche pour chaque langue/marché avant publication ; ne pas confondre Google Play avec Google Business Profile.

| Page | Besoin et matière attendue | Conversion logique |
| --- | --- | --- |
| Guide répondre aux avis Google Play | Procédure native, permissions, limite de 350 caractères, exemples, fenêtre API d'une semaine et différence avec la console | Guide de connexion et démo |
| Gérer App Store et Google Play ensemble | Vrai workflow multi-store, différences, filtres, limites, bénéfice face aux deux consoles | Essai avec les stores |
| Guide connecter App Store | Prérequis, valeurs, permissions, erreurs et vérification | Réussite de connexion |
| Gestion d'avis self-hosted | Cas d'usage, coûts d'exploitation, installation testée, mises à jour, sauvegardes | Installation ou Cloud |
| Répondre à un avis négatif d'app | Exemples spécifiques : crash, abonnement, bug corrigé ; contexte et validation humaine | Démo d'un brouillon contextualisé |
| Cas Bibliocards | Preuve observée et limites, pas une landing de mots-clés | Confiance et essai |

Commencer par deux contenus qui servent aussi à l'activation : les guides store, puis une page multi-store ou self-hosted selon les retours. Un article « comment répondre » peut attirer des visiteurs voulant seulement utiliser la console gratuite : juger les activations, pas seulement les clics.

Pour chaque publication : auteur identifiable, date de vérification, sources fournisseurs, exemples propres, capture utile, canonical, titre distinct, lien depuis le site, CTA pertinent et mesure. Éviter les pages de comparaison concurrentielle avant d'avoir testé et documenté les critères. Garder l'anglais comme hypothèse initiale cohérente avec le site, valider une audience française avant de doubler tous les contenus.

## Distribution et apprentissage

### A15 — Recruter un petit groupe de développeurs pertinents — P1

Constituer une liste manuelle d'environ 20 à 30 candidats ayant une app publiée et des avis récents ; objectif de travail, pas prédiction de taux de réponse. Prioriser relations existantes et lieux où l'on peut montrer son propre retour d'expérience : communautés mobiles/indie, dépôts et discussions pertinents, réseau professionnel. Vérifier les règles de chaque communauté avant toute publication.

Préparer une démonstration courte et un message expliquant le problème traité, la relation du fondateur à Bibliocards, les limites et la demande de retour. Ne pas envoyer de campagnes automatisées, ni publier des messages durant cet audit.

Conduire cinq essais accompagnés si le recrutement le permet. Observer : compréhension sans explication, confiance pour fournir l'accès, connexion autonome, avis disponibles, brouillon utile, publication souhaitée, raison de revenir, raison de payer ou de rester sur les consoles.

Une bonne question : « Montre-moi la dernière fois que tu as répondu à un avis et ce qui t'a ralenti. » Une déclaration d'intérêt pour l'IA ou un compliment sur le site ne valide pas le besoin.

Tester au plus deux canaux de distribution simultanément pour conserver une attribution interprétable. Réutiliser le cas Bibliocards comme contenu de présentation. Repousser un lancement large jusqu'à ce que les premiers essais ne bloquent plus sur le parcours.

Pour le retour, comprendre d'abord le rythme des nouveaux avis. Si les testeurs oublient de revenir malgré de nouveaux avis utiles, tester un rappel ou une notification choisie par l'utilisateur ; ne pas construire d'emblée un Weekly Digest complexe. Pour les apps à très faible volume, un retour quotidien n'est pas un objectif pertinent. Garder séparés engagement naturel, rappels et activité du fondateur.

### A16 — Garder l'outil gratuit comme expérience conditionnelle — P2

Un générateur anonyme ajoute coût, abus, collecte et besoin de distribution ; il risque d'attirer des avis de restaurants/commerces sans rapport avec les apps. Commencer par des exemples utiles et une démonstration du contexte. Envisager un outil seulement si les recherches et essais montrent une demande reliée au produit.

S'il est retenu : positionnement explicitement mobile, limite de longueur/langue, quotas, budget global, rate limit et bouton de copie ; jamais publication automatique. Mesurer outil → inscription → store valide, pas seulement générations. Ne pas inventer de garantie de trafic.

## Sprint borné et critères de décision

### Trois vérifications produit supplémentaires découvertes pendant l'audit

**A17 — Aligner IA disponible, confirmation UI et consommation — P0.** `packages/config/src/index.ts:301` refuse `AI_PROVIDER=managed` ; `apps/worker/src/ai-provider.ts:15` refuse également son exécution. Le mode `openai-compatible` est implémenté et peut servir une IA financée par l'opérateur Cloud : on ne peut donc pas conclure que l'IA ne fonctionne pas en production. Mais limites et Usage Events IA ne sont appliqués que pour `aiProvider === 'managed'` (`packages/reply-drafts/src/generate-reply-draft-for-review.ts:47`, `:201`). Vérifier le mode déployé, puis faire correspondre offre, facturation, quotas et provider réellement utilisé. La capacité à fournir son propre provider par Organization n'est pas démontrée par le seul flag BYOK du plan ; ne pas la vendre comme interface disponible sans test.

Autre défaut statique certain : l'API peut répondre `{queued:false}` quand la génération est désactivée (`apps/api/src/queue.ts:14`, `apps/api/src/routes/reply-inbox.ts:237`), mais le frontend annonce tout de même une génération en attente (`apps/web/src/app/pages/reply-inbox/reply-inbox.page.ts:73`). Afficher l'indisponibilité et proposer la rédaction manuelle. Vérifier provider actif, job accepté, brouillon produit, erreur, quota et consommation. Un message de succès n'est pas une preuve de génération.

**A18 — Rendre Reply Context accessible ou retirer cette promesse — P1 avant la démonstration.** Le moteur lit bien `replyContext`, `defaultLanguage` et `mappedLanguages` (`packages/reply-drafts/src/generate-reply-draft-for-review.ts:61`), mais les contrats et formulaires App inspectés n'exposent pas ces réglages (`packages/contracts/src/app.ts:66`, formulaire de connexion). Implémenter un réglage minimal si ce bénéfice est central, ou utiliser pour l'instant une promesse strictement limitée au contexte de l'avis. Ne pas filmer une configuration manuelle en base comme si le client pouvait la réaliser. Les Weekly Digests apparaissent aussi dans le vocabulaire et les types d'événements mais aucun parcours exécutable n'a été identifié : les garder hors des promesses acquises.

**A19 — Reprendre un onboarding interrompu et éviter les écrans morts — P1.** Tester compte créé puis abandon avant création d'Organization, retour par login, absence d'Organization active et reprise. Le menu « New organization » existe (`apps/web/src/app/layout/app-shell.component.ts:92`) : le problème est l'absence de reprise guidée, pas l'impossibilité absolue de créer. Ajouter une checklist et rediriger vers la prochaine étape utile. Le menu « Account settings » mène à un composant au template vide (`apps/web/src/app/pages/settings/settings.page.ts:5`) : rendre ce parcours utile ou retirer temporairement le lien. Pour une promesse d'équipe, vérifier aussi invitation et livraison email, déclarée inactive dans la configuration publique actuelle.

Estimations indicatives de travail, à recalibrer après découpage ; aucune date de livraison garantie.

| Lot | Contenu | Effort indicatif | Condition de sortie |
| --- | --- | --- | --- |
| 1 — Essai utilisable | A01–A05, A17, A19 ; commencer immédiatement le recrutement | 4–7 jours | Un testeur extérieur obtient une valeur ou un état vide explicite ; liens, IA et récupération vérifiés |
| 2 — Mesure et message | A06–A11, arbitrage A18, version courte du cas et guides | 3–5 jours, plus A18 si développé | Attribution et étapes mesurées ; proposition comprise ; limites cohérentes |
| 3 — Distribution | A12–A15, deux contenus initiaux et cinq essais visés | 2–4 jours répartis | Motifs des abandons connus ; premières cohortes suivies |
| Ensuite | Suivi à 30–45 jours puis SEO plus long si nécessaire | Temps borné hebdomadaire | Décision argumentée, pas nouveau sprint automatique |

Si le temps disponible est faible, réduire le lot 2 à une démonstration, une landing clarifiée et deux guides ; différer outil gratuit, refonte graphique, traduction complète et nouvelles fonctions d'analyse.

Tableau de décision à relire par cohorte, sans seuil universel :

- Peu de visites qualifiées malgré les actions : problème de distribution ou segment à reconsidérer ; pas de verdict produit.
- Visites qualifiées sans inscription : vérifier clarté, confiance, promesse et prix.
- Inscriptions sans connexion : prérequis, accès store, guides, crainte liée aux secrets.
- Connexions sans avis : fenêtre Google, worker, délai ou plafond ; ne pas appeler cela un rejet commercial.
- Avis importés sans traitement utile : qualité des brouillons, contexte ou problème pas assez important.
- Usage initial sans retour : regarder d'abord l'arrivée de nouveaux avis et la fréquence naturelle du besoin.
- Retours réguliers sans paiement : valeur Free suffisante, mauvais acheteur ou valeur Cloud insuffisante ; interroger avant de réduire Free.
- Quelques utilisateurs externes récurrents et prêts à payer : continuer sur leurs blocages communs, sans généraliser trop tôt.

Les objectifs de recrutement et d'essais sont des objectifs d'apprentissage, pas une démonstration statistique de product-market fit. Le nombre de publications sur les stores ne doit pas être maximisé si l'utilisateur préfère ignorer un avis ou ne pas publier un brouillon insatisfaisant.

## Ce qui reste à vérifier

Indexation réelle et données tous canaux ; nombre d'utilisateurs et paiements externes ; configuration effective des workers/IA/Stripe/email ; un parcours complet sur chaque store ; installation self-hosted vierge ; affichage mobile ; performance terrain ; réalité de l'usage Bibliocards et éléments publiables. Ces inconnues ne justifient pas de reporter les corrections de liens, de récupération ou d'état vide établies par l'audit.
