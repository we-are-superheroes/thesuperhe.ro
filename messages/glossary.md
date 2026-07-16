# Translation glossary

This file is included **verbatim** in the system prompt of `npm run translate`.
Editing anything here changes the glossary hash, which marks **every translated
key stale** — the next `npm run translate` regenerates all translations with the
new rules. Keep it short and unambiguous; the model follows it literally.

## Product vocabulary (pinned renderings)

Use these renderings exactly and consistently. Match case to the sentence
position (capitalise at the start of a sentence or button label, otherwise
follow the target language's normal casing rules). Inflect nouns for case,
number and gender as the target grammar requires, but keep the same lexeme.

| Term (en) | fr | de | es | it | ru | uk | pt |
|---|---|---|---|---|---|---|---|
| The Superhero | The Superhero | The Superhero | The Superhero | The Superhero | The Superhero | The Superhero | The Superhero |
| project | projet | Projekt | proyecto | progetto | проект | проєкт | projeto |
| step | étape | Schritt | paso | passaggio | шаг | крок | etapa |
| blueprint | modèle | Blaupause | plantilla | modello | шаблон | шаблон | modelo |
| fork (verb, fork a blueprint) | adapter | übernehmen | adaptar | adattare | адаптировать | адаптувати | adaptar |
| claim a step | prendre une étape | einen Schritt übernehmen | encargarse de un paso | prendere in carico un passaggio | взять шаг на себя | взяти крок на себе | assumir uma etapa |
| organisation | organisation | Organisation | organización | organizzazione | организация | організація | organização |
| lead (project lead) | responsable du projet | Projektleitung | responsable del proyecto | responsabile del progetto | руководитель проекта | керівник проєкту | responsável pelo projeto |
| contributor | contributeur | Mitwirkende(r) | colaborador | collaboratore | участник | учасник | colaborador |
| skill match | compétence recherchée | passende Fähigkeit | habilidad buscada | competenza richiesta | подходящий навык | відповідна навичка | habilidade procurada |
| Needs help (status label) | Besoin d'aide | Hilfe gesucht | Necesita ayuda | Serve aiuto | Нужна помощь | Потрібна допомога | Precisa de ajuda |
| Ask for help (action) | Demander de l'aide | Um Hilfe bitten | Pedir ayuda | Chiedere aiuto | Попросить помощи | Попросити допомоги | Pedir ajuda |
| browse (projects/blueprints) | explorer | durchstöbern | explorar | esplorare | смотреть | переглядати | explorar |

Hard rule: **"The Superhero" (the product name) is NEVER translated, transliterated
or declined — it stays exactly `The Superhero` in every language.**

## Address form (register)

How the UI addresses the user:

- **fr**: informal **tu**. (Owner may flip to vous — change this line and re-run translate.)
- **de**: informal **du** (lowercase mid-sentence, per current German informal convention).
- **es**: informal **tú**.
- **it**: informal **tu**.
- **pt**: **você**.
- **ru**: **вы** (lowercase, not «Вы»).
- **uk**: **ви** (lowercase, not «Ви»).

## Tone rules

- Plain language everywhere. Many readers are not native speakers of the target
  language either: prefer common words, short sentences, active voice. Split
  long English sentences if it helps.
- **marketing** namespace: carry the original's flair and energy — this is the
  one place personality beats plainness. Still no jargon.
- **legal-privacy** and **legal-terms** namespaces: formal register and faithful,
  precise translation. Do not simplify away legal meaning.
- Keep UI labels (buttons, tabs, column headers) as short as the language allows.
