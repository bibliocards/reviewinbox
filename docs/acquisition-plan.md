# Acquisition SEO, GEO et open source

Audit du 2 novembre 2026. Objectif choisi : attirer des développeurs d'apps vers le plan Cloud gratuit, puis vers une première Store Connection et une première publication. Les visites et les stars sont des signaux intermédiaires.

## Diagnostic

Le socle technique observé fonctionne : site statique, contenu lisible dans le HTML, canonicals, sitemap et liens vers les guides. Le principal chantier visible est de mieux couvrir les problèmes recherchés par les développeurs, puis de distribuer ces contenus dans des endroits pertinents. Ce diagnostic n'établit pas pourquoi Google classe ou exclut une URL donnée.

La capture Search Console fournie affiche 1 clic, 6 pages indexées et 4 non indexées, avec aucune donnée Core Web Vitals. La consultation autorisée de la console a ensuite identifié une exclusion normale de HTTP vers HTTPS et trois URL détectées mais non encore explorées : tarifs, index des docs et self-hosting. Le [compte rendu d’indexation](search-console-indexation.md) détaille les preuves et le blocage reCAPTCHA de la demande d’indexation. Les requêtes et impressions restent à exporter avant de conclure sur le CTR ou les mots-clés.

### Constats et priorités

| Priorité | Constat et preuve | Impact et action |
| --- | --- | --- |
| P1 | Le H1 de l'accueil parlait de « Every store review answered », sans nommer les deux stores. Le titre nommait les stores mais pas clairement la catégorie de logiciel. [Source avant modification](https://github.com/bibliocards/reviewinbox/blob/e19102d67593a773ab999b0a16caa9f7c0555b8b/apps/site/src/pages/index.astro) | Clarifier immédiatement le public et le besoin couvert. Première passe locale : titre, description et introduction orientés gestion des avis et Cloud gratuit. Aucun gain de position garanti. |
| P1 | Le sitemap public contient 9 URL : accueil, tarifs, index des docs et 6 guides. Pas de rubrique éditoriale ni de pages d'acquisition par cas d'usage. [Sitemap](https://reviewinbox.app/sitemap-0.xml) | Peu de portes d'entrée pour des recherches métier. Créer progressivement les contenus de la carte ci-dessous, avec des preuves produit et une intention distincte par URL. |
| P1 | Le README proposait Website et User guides mais pas d'accès direct au Cloud. Les guides décrivent surtout la configuration. [README initial](https://github.com/bibliocards/reviewinbox/blob/e19102d67593a773ab999b0a16caa9f7c0555b8b/README.md) | Une découverte GitHub ou documentaire doit mener facilement à l'essai. Première passe locale : lien Cloud dans le README, l'index des guides et le guide de gestion des deux stores. |
| P1 | L'[API du dépôt](https://api.github.com/repos/bibliocards/reviewinbox) renvoie `license.spdx_id: NOASSERTION`, alors que le README annonce Apache-2.0. Le fichier au commit audité contient une notice courte, pas le texte intégral. [Licence auditée](https://github.com/bibliocards/reviewinbox/blob/e19102d67593a773ab999b0a16caa9f7c0555b8b/LICENSE.md) | Fiabiliser la reconnaissance de la licence pour les visiteurs et les catalogues. Le texte officiel complet Apache-2.0 a été ajouté localement, avec le copyright conservé. La licence choisie reste la même ; sa détection par GitHub reste à vérifier après publication. [Détection GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository#detecting-a-license). |
| P1 | Le [rapport d'activation](acquisition-measurement.md#registration-attribution) mesurait initialement les activations sans provenance. | Une attribution facultative des nouvelles inscriptions Cloud est maintenant préparée, avec agrégation par source/campagne. Les visites, la rétention et l’attribution des publications restent hors mesure. |
| P2 | Les topics GitHub observés sont `ai`, `app-store`, `google-play`, `open-source`, `reviews`, `saas`. | Ajouter des termes de découverte plus précis, sans remplir artificiellement les 20 emplacements. Proposition ci-dessous. [Fonctionnement des topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics). |

### Vérifications techniques réalisées

Lectures HTTP publiques avec curl, sans navigateur ni test de performance :

- `/robots.txt` répond et autorise l'exploration ; il référence `/sitemap-index.xml`.
- Le sitemap index et `/sitemap-0.xml` répondent et contiennent les 9 URL attendues.
- `/`, `/pricing/`, `/docs/`, `/docs/self-hosting/` et `/docs/manage-both-stores/` répondent en HTTP 200 avec un canonical propre à la page et un H1.
- Les cinq pages ont un titre et une description ; aucune directive `noindex` n'a été observée dans leur HTML. L'absence de balise robots dans les guides n'est pas un défaut : `index, follow` est la valeur par défaut.
- Une URL inexistante répond en HTTP 404, sans redirection vers l'accueil.
- Le HTML de l'accueil contient déjà un `SoftwareApplication` en JSON-LD. Aucun constat d'absence de schema n'est fait à partir d'un extracteur de texte.

Une première tentative via urllib a reçu des 403, alors que curl a ensuite obtenu les réponses ci-dessus. Cela ne prouve pas un blocage de Googlebot. Les règles CDN/WAF et les réponses réellement reçues par les robots restent à vérifier dans les consoles et journaux appropriés.

La redirection HTTP de l’accueil a ensuite été vérifiée : 301 vers HTTPS. Les trois URL détectées sans indexation répondent en HTTP 200 sans en-tête X-Robots-Tag observé. Les Core Web Vitals, le rendu mobile, les redirections www, les en-têtes de toutes les autres URL et le balisage injecté par JavaScript restent non audités. L’absence de données CWV dans la capture n’indique pas que le site est lent. La Search Console a été consultée pour les exclusions ; aucun test visuel du site local n’a été lancé.

## Première passe préparée dans le dépôt

- Accueil : titre et H1 explicites sur App Store/Google Play, description et introduction pour les développeurs, FAQ sur le Cloud gratuit avec les limites issues des données tarifaires existantes.
- Tarifs : titre et description qui mettent le plan gratuit et les limites au premier plan.
- JSON-LD : conservation du logiciel, ajout de `WebSite`, lien d'identité vers GitHub et précision de l'offre gratuite. Pas d'évaluation inventée ni de promesse de résultat enrichi.
- Suppression des meta keywords de l'accueil et des docs : [Google les ignore](https://developers.google.com/search/docs/crawling-indexing/special-tags#unsupported). C'est un nettoyage, pas un levier de classement.
- README et guides : accès direct au Cloud gratuit tout en conservant le parcours self-hosting.
- Guide des deux stores enrichi avec une explication autonome du produit et un exemple illustratif de réponse à une plainte, fondé sur le workflow réel.
- Licence intégrale et attribution des inscriptions Cloud préparées, avec migration `0011_signup_acquisition`. Voir les [règles de mesure et limites](acquisition-measurement.md#registration-attribution).

Ces changements restent locaux jusqu'au commit et au déploiement. Ils améliorent le positionnement et le parcours ; ils ne remplacent pas la création de contenus utiles ni leur diffusion.

Validation : `pnpm nx run-many -t typecheck build -p site`, `pnpm nx lint site`, vérification du format de la configuration et `git diff --check` réussis. Un build supplémentaire avec `PUBLIC_APP_URL=https://cloud.reviewinbox.app` a permis de contrôler le HTML généré : un H1 et un canonical par page modifiée, liens Cloud de production, JSON-LD lisible et absence de meta keywords. Le build signale des avertissements Astro/Starlight sur une directive MDX, la collection i18n vide et l'entrée 404 absente ; les pages sont générées. Rendu examiné statiquement, sans validation visuelle navigateur.

Pour le second lot, les tests, contrôles de types et lint de `api`, `web`, `contracts`, `db` et `acquisition-report` passent, ainsi que les builds de production API/web/site. Les tests d'intégration PostgreSQL conditionnés par une base dédiée restent désactivés ; aucune migration n'a été appliquée à une base de production. Un contrôle Node du script réellement compilé vérifie le maintien de la provenance entre pages, la transmission vers le Cloud sans perte du plan, les liens externes inchangés et le fonctionnement sans stockage navigateur. Le cache Nx du site et le déclenchement de son déploiement prennent désormais en compte sa dépendance au contrat d'attribution partagé.

## Carte de contenus à construire

Les requêtes sont des hypothèses d'intention, sans volume ni difficulté mesurés. Commencer en anglais, langue du site actuel ; ne pas créer immédiatement des doublons français ou une série de pages quasi identiques.

| Ordre | URL existante ou envisagée | Intention principale | Matière à apporter et conversion |
| --- | --- | --- | --- |
| 1 | `/` existante | `app review management software` | Vue produit et Cloud gratuit ; CTA inscription. |
| 2 | `/docs/manage-both-stores/` existante | `manage App Store and Google Play reviews together` | Enrichir le guide avec captures réelles, étapes de tri et limites des stores. Garder cette URL pour éviter une page produit concurrente sur la même intention. CTA Cloud ajouté. |
| 3 | `/guides/respond-to-negative-app-reviews/` proposée | `how to respond to negative app reviews` | Cas concrets anonymisés avec autorisation, brouillon avant/après et raison des corrections. Distinguer remboursement, bug confirmé et demande de fonctionnalité. Relier au workflow réel de Reply Draft puis publication. |
| 4 | `/guides/google-play-review-history/` proposée | `Google Play reviews API history limit` | Expliquer la fenêtre disponible, les limites de la synchronisation et pourquoi une première importation peut être vide. S'appuyer sur la documentation du store et un scénario reproduit, sans promettre l'import CSV absent. Relier au guide de connexion. |
| 5 | `/guides/app-review-analysis/` proposée | `app review analysis` | Montrer comment passer d'avis à un problème récurrent avec captures, distinction note/sévérité et corrections humaines. Le guide docs actuel reste la référence de configuration. |
| 6 | Comparatif ciblé, URL à choisir après recherche | Alternative à un outil réellement utilisé par les prospects | Comparer uniquement les fonctions vérifiées, le périmètre et les prix datés. Expliquer à qui ReviewInbox convient et ce qui manque ; ne pas annoncer une parité ASO ou une migration qui n'existent pas. |

Une page doit répondre au problème avant de proposer le produit. Ajouter les liens depuis l'accueil ou les guides existants ; ne pas publier de page orpheline. Chaque nouvelle page doit avoir son titre, sa description, son canonical et sa présence dans le sitemap généré.

## GEO : rendre le produit compréhensible et vérifiable

Le GEO se travaille ici avec les mêmes fondations : contenu accessible, réponses précises, exemples originaux et identité cohérente. Google indique que ses fonctions génératives reposent sur son index et ses systèmes de recherche ; aucun fichier IA spécial n'est nécessaire. [Guide officiel](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

Actions utiles :

1. Expliquer en quelques phrases autonomes ce que fait ReviewInbox, pour qui, avec quels stores et quelles limites. Employer les mêmes faits sur le site, GitHub et les fiches d'annuaires.
2. Publier des exemples issus du produit, clairement distinguer les illustrations des preuves réelles et dater les limites d'API vérifiées. Les avis importés ne sont pas des témoignages sur ReviewInbox.
3. Vérifier que `OAI-SearchBot` accède au site au niveau du CDN, en plus du robots.txt permissif. Son accès est indépendant de celui du robot d'entraînement `GPTBot`. [Robots OpenAI](https://developers.openai.com/api/docs/bots).
4. Conserver un balisage fidèle au contenu visible. Le `SoftwareApplication` actuel n'est pas suffisant pour promettre un résultat enrichi Google : il manque notamment une vraie évaluation du logiciel. Ne pas en inventer. [Conditions Google](https://developers.google.com/search/docs/appearance/structured-data/software-app#required-properties).
5. Chercher les citations et les visites utiles, sans promettre qu'une modification provoquera une recommandation par ChatGPT ou Google.

`llms.txt` n'est pas prioritaire : [Google dit l'ignorer](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide#mythbusting-generative-ai-search-what-you-dont-need-to-do). [IndexNow](https://www.indexnow.org/documentation) peut être envisagé pour signaler les nouvelles pages aux moteurs participants, mais le sitemap suffit pour cette première passe et aucune indexation n'est garantie. Le [rapport IA de Search Console](https://support.google.com/webmasters/answer/16984139) permet de suivre les impressions génératives lorsqu'elles sont disponibles.

## GitHub : convertir la découverte en essai Cloud

Le site est déjà renseigné dans About et le dépôt est public. Pas besoin de renommer le projet ni d'ajouter des badges sans valeur.

- **Description proposée** : `Open-source app review management for App Store and Google Play. AI reply drafts, human-controlled publishing, and a free Cloud plan.`
- **Topics proposés**, en conservant les pertinents existants : `app-store`, `google-play`, `app-reviews`, `review-management`, `self-hosted`, `open-source`, `saas`, `ai`, `reviews`. Aucun volume de recherche GitHub n'a été mesuré pour ces termes.
- **README** : lien d'essai Cloud ajouté avant les informations de développement. Conserver la capture existante et la transparence early alpha.
- **Licence** : corriger la reconnaissance décrite dans le diagnostic avant les soumissions open source.
- **Social preview** : vérifier le visuel configuré dans Settings ; l'API consultée ne suffit pas à établir son état. GitHub conseille une image 1280 × 640 de moins de 1 Mo. [Documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview).
- **Releases** : continuer à décrire les changements utiles aux développeurs et renvoyer vers les guides correspondants. Ne pas fabriquer de stars, de votes ou d'activité.

La description, les topics et les réglages distants n'ont pas été modifiés. Les suggestions sont prêtes à être appliquées avec le lot de diffusion.

## Annuaires et communautés : sélection courte, reportée

Ces pistes sont reportées à la demande du mainteneur ; aucune soumission n’est lancée dans ce lot. Priorités estimées selon l'adéquation au produit, pas selon une audience ou un nombre de conversions mesurés. Vérifier d'abord si ReviewInbox possède déjà une fiche : une recherche Web sans résultat ne prouve pas son absence. Une fiche acceptée n'assure ni backlink valorisé, ni indexation, ni trafic.

| Priorité | Canal et parcours vérifié | Intérêt pour le Cloud et condition |
| --- | --- | --- |
| 1 | [AlternativeTo : ajout d'application](https://alternativeto.net/faq/#add-a-new-application) | Intention de recherche d'alternative. Compte avec email vérifié, fiche puis modération ; attente gratuite potentiellement très longue. Décrire freemium Cloud et édition open source/self-hosted distinctement. Ne rattacher que des alternatives fonctionnelles vérifiées. Aucun paiement proposé. |
| 1 | [OpenAlternative : soumission](https://openalternative.co/submit), [présentation du catalogue](https://openalternative.co/about) | Correspond au positionnement open source. L'ajout exige une connexion ; critères et coût éventuel après connexion restent non vérifiés. Donner le dépôt et l'URL produit ; faire du Cloud gratuit le parcours simple dans la description. |
| 2 | [SaaSHub : formulaire et critères](https://www.saashub.com/services/submit#successful-submission-advice) | Catalogue logiciel plus large. Préparer catégories, alternatives comparables et adresse sur le domaine pour la vérification. Le site demande une soumission humaine ; rien n'a été envoyé. |
| 2 | [Awesome Selfhosted : règles](https://github.com/awesome-selfhosted/awesome-selfhosted-data/blob/master/CONTRIBUTING.md#add-software-to-the-list) et [checklist](https://github.com/awesome-selfhosted/awesome-selfhosted-data/blob/master/.github/PULL_REQUEST_TEMPLATE.md) | Public plutôt self-hosting que Cloud, utile comme preuve de confiance. La première [release v0.1.0](https://github.com/bibliocards/reviewinbox/releases/tag/v0.1.0) date du 20 juin 2026 : le délai actuel de quatre mois est dépassé au 2 novembre. Les autres critères, doublons et installation restent à vérifier ; les contributions générées par IA sont interdites, donc candidature à rédiger et soumettre personnellement. |
| 3 | [Product Hunt : parcours de lancement](https://help.producthunt.com/en/articles/479557-how-to-post-a-product) | À réserver à un moment où captures, démonstration et disponibilité pour répondre sont prêtes. Compte personnel requis ; le lancement ne garantit pas d'être mis en avant. Mesurer les essais activés, pas les votes. |
| 3 | [Show HN : règles](https://news.ycombinator.com/showhn.html) | Angle technique crédible : synchroniser deux stores avec publication sous contrôle humain. Les visiteurs doivent pouvoir essayer quelque chose ; une simple page d'inscription ne suffit pas. Priorité après un parcours de démonstration adapté. |

OpenSourceAlternative.to n'est pas retenu dans le premier lot : sa page de soumission n'a pas pu être vérifiée dans cette recherche. On pourra la réévaluer, sans promettre un délai ou une acceptation.

Au-delà des annuaires, publier un retour d'expérience utile dans les communautés de développeurs mobiles où le mainteneur participe déjà : problème rencontré, exemple précis, limites et lien pertinent. Vérifier les règles propres à chaque communauté avant une publication. Ne pas diffuser le même message en masse.

## Mesure et séquence sur 30 jours

### Première semaine

Déployer la première passe après revue des changements. Dans Search Console, examiner les 4 URL exclues et leur motif, vérifier les URL canoniques importantes et le sitemap soumis. Exporter requêtes, pages, pays, impressions, clics, CTR et position sur la période disponible, puis les 28 derniers jours. Séparer marque et hors marque. L'historique faible ne permet pas encore de choisir des mots-clés à partir des seuls clics.

La correction de licence est préparée. About/topics, social preview et toutes les soumissions externes restent reportés au lot de diffusion demandé ultérieurement.

### Deuxième semaine

Enrichir le guide existant de gestion des deux stores avec une vraie démonstration. Produire une première page éditoriale répondant à un problème observé chez les développeurs. Ajouter les liens internes et proposer le Cloud comme suite naturelle.

La mesure minimale des inscriptions est préparée via la provenance facultative envoyée à la création du compte Cloud, avec un rapport par source/campagne. La mesure des visites reste à définir. Les UTM et paramètres de transfert ne changent pas les canonicals. Aucun service analytics tiers n’a été ajouté.

### Troisième et quatrième semaines

Choisir le second contenu d'après les premières impressions et les questions réellement reçues. Tester un canal communautaire pertinent, répondre aux personnes intéressées, puis comparer les résultats avec le temps investi. Préparer un lancement large seulement si l'essai produit et le suivi sont prêts.

| Niveau | Indicateur | Disponible actuellement |
| --- | --- | --- |
| Découverte SEO | Impressions et clics hors marque par page/requête | Search Console, à exporter ; capture insuffisante. |
| Découverte IA | Impressions IA Google, citations Bing et visites référentes identifiables | Rapports à ouvrir si disponibles ; pas de chiffres récupérés ici. |
| Intérêt | Inscriptions par source/campagne | Implémenté pour les nouvelles inscriptions Cloud après migration/déploiement ; visites et clics non mesurés. |
| Activation | Organization → Store Credential validé → premier import → premier brouillon sauvegardé → première publication | Agrégats disponibles via le [rapport d'acquisition](acquisition-measurement.md), sans attribution de canal. |

Fixer les objectifs chiffrés après une première mesure fiable. Revoir l'indexation et la diffusion à J+7, puis les impressions et activations à J+28 ; ce délai est un point de suivi, pas une promesse de résultats SEO.

## Méthode et limites

Cadre : [skill seo-audit fourni](https://github.com/coreyhaines31/marketingskills/blob/main/skills/seo-audit/SKILL.md), confronté aux documentations officielles. Sources locales auditées au commit `e19102d67593a773ab999b0a16caa9f7c0555b8b`, métadonnées GitHub et pages publiques lues le 2 novembre 2026. Pas d'estimation inventée de volume, d'autorité ou de trafic concurrent.

La recherche préalable Stripe Directory n'a pas pu aboutir : installation du plugin refusée avec les identifiants Stripe actuellement expirés. Les parcours ci-dessus ont été vérifiés sur les sites officiels à la place. La CLI Stripe a été installée localement pour cette tentative ; aucun service ni paiement n'a été créé. Aucun annuaire, réseau social ou compte GitHub n'a reçu de publication ou de modification distante.
