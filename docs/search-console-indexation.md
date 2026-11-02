# Indexation Search Console

Lecture du 2 novembre 2026 pour `reviewinbox.app`. Le [rapport d'indexation](https://search.google.com/search-console/index?resource_id=sc-domain%3Areviewinbox.app) porte la date de mise à jour du 23 octobre 2026 : 6 pages indexées, 4 exclues et 2 motifs. Les états ci-dessous décrivent ce rapport, pas une garantie de l'état instantané de l'index.

| URL | État observé | Traitement |
| --- | --- | --- |
| `http://reviewinbox.app/` | Page avec redirection, dernière exploration le 20 octobre. Une ancienne validation est marquée en échec. | Le contrôle HTTP confirme une 301 vers `https://reviewinbox.app/`. Cette exclusion est attendue : conserver la redirection et le canonical HTTPS ; ne pas chercher à indexer HTTP. |
| `https://reviewinbox.app/pricing/` | Détectée, actuellement non indexée ; dernière exploration « Sans objet ». L'inspection confirme le sitemap et l'accueil comme sources de découverte. | HTTP 200, canonical propre et contenu présent dans le HTML. Titres et description améliorés localement. Demande d'indexation tentée, sans prise en compte confirmée, voir ci-dessous. |
| `https://reviewinbox.app/docs/` | Détectée, actuellement non indexée ; dernière exploration « Sans objet ». | HTTP 200, canonical propre, lien depuis l'accueil et présence dans le sitemap. Introduction et parcours Cloud enrichis localement. |
| `https://reviewinbox.app/docs/self-hosting/` | Détectée, actuellement non indexée ; dernière exploration « Sans objet ». | HTTP 200, canonical propre, liens depuis l'accueil et les docs, présence dans le sitemap. Aucun blocage constaté justifiant une modification de l'URL. |

Ces trois pages sont connues de Google ; le rapport ne montre pas encore d'exploration. Il ne permet pas de conclure qu'elles ont été rejetées pour leur qualité. Ne pas ajouter de redirections, supprimer les canonicals ou modifier les URL pour faire disparaître ces états. [Explication Google du motif](https://support.google.com/webmasters/answer/7440203#discovered__unclear_status).

## Demande d'indexation bloquée

Sur `/pricing/`, l'action « Demander une indexation » a lancé la vérification, puis affiché : « Un problème est survenu lors de l'envoi de votre demande d'indexation. Veuillez réessayer ultérieurement. » La page a ensuite signalé l'impossibilité de joindre le service reCAPTCHA. Un rechargement et une seconde tentative n'ont pas fourni de confirmation de soumission ; un conteneur reCAPTCHA vide restait présent. Aucun succès de soumission n'a été confirmé ; les deux autres URL n'ont pas été soumises après ce blocage.

À reprendre dans une session où reCAPTCHA fonctionne : inspecter chacune des trois URL HTTPS, puis demander son indexation. Une soumission réussie reste une demande, pas une garantie d'exploration ni d'indexation. Le sitemap est déjà accessible et cité par Google ; il n'est pas nécessaire de le resoumettre en boucle. [Parcours officiel](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl).

Une nouvelle tentative a été effectuée à la demande du mainteneur le 2 novembre, après une nouvelle inspection de `/pricing/`. Elle a de nouveau abouti au message « Impossible d'établir une connexion avec le service reCAPTCHA », sans confirmation d'envoi. L'inspection reste ouverte pour reprise manuelle ; aucun défi CAPTCHA n'a été résolu ou contourné.

La consultation de Search Console et cette tentative de demande d'indexation sont les seules actions navigateur de ce lot. Aucun test visuel du site local n'a été lancé. Les changements de code et de contenu restent à déployer ; ils n'ont pas été présentés comme déjà publiés à Google.
