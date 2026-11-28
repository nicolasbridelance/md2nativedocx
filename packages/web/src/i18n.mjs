/**
 * The page's text, in English and French. The language follows the browser (`fr*` gives French) and can
 * be switched on the page.
 */

const en = {
  lang: 'en',
  title: 'Markdown to Word, diagrams included',
  eyebrow: 'Free and open source · public domain',
  titleLead: 'Markdown to Word,',
  titleAccent: 'diagrams included',
  proofShapes: 'Every box is a Word shape you can retype and move',
  proofSmartArt: 'SmartArt and Word charts with editable data',
  navGithub: 'GitHub',
  tagline: 'Paste Markdown with Mermaid or PlantUML diagrams, get a Word document where every diagram is real, editable shapes, SmartArt or charts. Not pictures.',
  privacy: 'Everything happens in your browser: your text is never sent anywhere.',
  switchLanguage: 'Français',
  editorLabel: 'Your Markdown',
  openFile: 'Open a .md file',
  loadExample: 'Load an example',
  clear: 'Clear',
  dropHint: 'Drop a Markdown file here',
  placeholder: '# Title\n\nWrite or paste Markdown here, with ```mermaid diagrams…',
  loadedFrom: (name) => `From ${name}`,
  charCount: (n) => `${n.toLocaleString('en')} characters`,

  engineTitle: 'Conversion engine',
  engineWhy: 'Why wait?',
  engineWhyText: (mb, version) =>
    `The document is converted by Pandoc ${version}, the standard document converter, running here in your browser rather than on a server: that is how your text stays with you. Its engine is a ${mb} MB file (about a quarter of that to download). Your browser keeps it, so next time the page is ready almost at once.`,
  engineIdle: 'Not loaded yet.',
  engineSaveData: 'Your browser asks to save data, so the engine (about 17 MB) was not downloaded automatically.',
  engineLoadNow: 'Download the engine',
  engineDownload: (done, total) => `Downloading the engine: ${done} of ${total} MB. Only this once.`,
  engineCache: 'Loading the engine from your browser’s storage…',
  engineVerify: 'Checking that the engine file is the published one…',
  engineCompile: 'Preparing the engine (a few seconds, once per visit)…',
  engineReady: (seconds) => `Ready (${seconds} s). A conversion now takes a few seconds at most.`,
  engineUnsupported: 'This browser is too old to run the converter. Use a recent version of Chrome, Edge, Firefox or Safari.',
  engineNetwork: 'The engine could not be downloaded. Check your connection, then retry.',
  engineIntegrity: 'The engine file did not match its published fingerprint, so it was not run. Retry; if it happens again, please report it.',
  engineInternal: 'The engine could not start.',
  retry: 'Retry',

  optionsTitle: 'Options',
  optSmartArt: 'SmartArt',
  optSmartArtHint: 'Processes, cycles, trees, mind maps and timelines become SmartArt you can restyle in Word.',
  optCharts: 'Word charts',
  optChartsHint: 'Pie, bar, line and radar charts become Word charts with editable data.',
  optToc: 'Table of contents',
  optTocHint: 'Word fills it in when the document is opened.',

  convert: 'Convert to Word (.docx)',
  convertQueued: 'Will convert as soon as the engine is ready…',
  converting: 'Converting…',
  emptyInput: 'There is nothing to convert yet: write or paste some Markdown first.',
  convertShortcut: 'Shortcut: Ctrl+Enter (⌘+Enter on a Mac)',

  howTitle: 'How it works',
  how1Title: 'Write or paste Markdown',
  how1Text: 'Headings, tables, lists, code, maths, and diagrams in ```mermaid or ```plantuml blocks. Or open a .md file.',
  how2Title: 'Converted in your browser',
  how2Text: 'Pandoc, the standard document converter, runs inside this page. The diagrams are drawn as native Word objects, not as pictures.',
  how3Title: 'Edit everything in Word',
  how3Text: 'Click a box to retype it, drag it and its arrows follow, restyle a SmartArt, change a chart’s figures with Edit Data.',

  elsewhereTitle: 'Also where you already work',
  vscodeTitle: 'VS Code extension',
  vscodeText: 'Export the Markdown you are editing in one click. Also on Open VSX for VSCodium, Cursor and Windsurf.',
  cliTitle: 'Command line',
  cliText: 'npx @md2nativedocx/cli report.md, with your Word template, page setup, .pptx and .odt output.',
  mcpTitle: 'MCP server',
  mcpText: 'Let an AI assistant hand you a finished Word document, diagrams editable, from a conversation.',

  stepsTitle: 'Conversion',
  stepWait: 'Waiting for the engine',
  stepWaitDownload: (percent) => `Waiting for the engine (downloaded ${percent} %)`,
  stepWaitPrepare: 'Waiting for the engine (being prepared)',
  stepRead: 'Reading the Markdown',
  stepDiagrams: (done, total) => (total === undefined ? 'Drawing the diagrams' : total === 0 ? 'No diagram in this document' : `Drawing the diagrams (${done} of ${total})`),
  stepWrite: 'Writing the Word document',
  stepFinish: 'Adding SmartArt and charts, final checks',
  done: (seconds, diagrams) => `Done in ${seconds} s${diagrams ? `, ${diagrams} diagram${diagrams > 1 ? 's' : ''}` : ''}.`,
  download: (name) => `Download ${name}`,
  openInWord: 'Open it in Word: click a box to retype it, drag it and its arrows follow.',
  warningsTitle: (n) => `${n} note${n > 1 ? 's' : ''} about this conversion`,
  failed: 'The conversion failed:',

  footerPandoc: (version) => `Converter: Pandoc ${version} (GPL-2.0-or-later).`,
  footerNotices: 'Third-party notices',
  footerLicense: 'License',
  footerSource: 'Source code',
  footerProject: 'md2nativedocx on GitHub (public domain, CC0)',
};

/** @type {typeof en} */
const fr = {
  lang: 'fr',
  title: 'Markdown vers Word, diagrammes compris',
  eyebrow: 'Gratuit et open source · domaine public',
  titleLead: 'Markdown vers Word,',
  titleAccent: 'diagrammes compris',
  proofShapes: 'Chaque boîte est une forme Word que l’on retape et déplace',
  proofSmartArt: 'SmartArt et graphiques Word aux données modifiables',
  navGithub: 'GitHub',
  tagline: 'Collez du Markdown avec des diagrammes Mermaid ou PlantUML, obtenez un document Word où chaque diagramme est fait de vraies formes, de SmartArt ou de graphiques modifiables. Pas d’images.',
  privacy: 'Tout se passe dans votre navigateur : votre texte n’est envoyé nulle part.',
  switchLanguage: 'English',
  editorLabel: 'Votre Markdown',
  openFile: 'Ouvrir un fichier .md',
  loadExample: 'Charger un exemple',
  clear: 'Effacer',
  dropHint: 'Déposez un fichier Markdown ici',
  placeholder: '# Titre\n\nÉcrivez ou collez du Markdown ici, avec des diagrammes ```mermaid…',
  loadedFrom: (name) => `Depuis ${name}`,
  charCount: (n) => `${n.toLocaleString('fr')} caractères`,

  engineTitle: 'Moteur de conversion',
  engineWhy: 'Pourquoi attendre ?',
  engineWhyText: (mb, version) =>
    `Le document est converti par Pandoc ${version}, le convertisseur de documents de référence, qui tourne ici dans votre navigateur et non sur un serveur : c’est ce qui garde votre texte chez vous. Son moteur est un fichier de ${mb} Mo (environ quatre fois moins à télécharger). Votre navigateur le garde : la prochaine fois, la page est prête presque tout de suite.`,
  engineIdle: 'Pas encore chargé.',
  engineSaveData: 'Votre navigateur demande d’économiser les données : le moteur (environ 17 Mo) n’a pas été téléchargé automatiquement.',
  engineLoadNow: 'Télécharger le moteur',
  engineDownload: (done, total) => `Téléchargement du moteur : ${done} sur ${total} Mo. Une seule fois.`,
  engineCache: 'Chargement du moteur depuis votre navigateur…',
  engineVerify: 'Vérification que le moteur est bien celui publié…',
  engineCompile: 'Préparation du moteur (quelques secondes, une fois par visite)…',
  engineReady: (seconds) => `Prêt (${seconds} s). Une conversion prend maintenant quelques secondes au plus.`,
  engineUnsupported: 'Ce navigateur est trop ancien pour le convertisseur. Utilisez une version récente de Chrome, Edge, Firefox ou Safari.',
  engineNetwork: 'Le moteur n’a pas pu être téléchargé. Vérifiez votre connexion, puis réessayez.',
  engineIntegrity: 'Le fichier du moteur ne correspond pas à son empreinte publiée : il n’a pas été exécuté. Réessayez ; si cela se reproduit, merci de le signaler.',
  engineInternal: 'Le moteur n’a pas pu démarrer.',
  retry: 'Réessayer',

  optionsTitle: 'Options',
  optSmartArt: 'SmartArt',
  optSmartArtHint: 'Processus, cycles, arbres, cartes mentales et frises deviennent des SmartArt que Word sait restyler.',
  optCharts: 'Graphiques Word',
  optChartsHint: 'Camemberts, barres, courbes et radars deviennent des graphiques Word aux données modifiables.',
  optToc: 'Table des matières',
  optTocHint: 'Word la remplit à l’ouverture du document.',

  convert: 'Convertir en Word (.docx)',
  convertQueued: 'La conversion partira dès que le moteur sera prêt…',
  converting: 'Conversion…',
  emptyInput: 'Rien à convertir pour l’instant : écrivez ou collez d’abord du Markdown.',
  convertShortcut: 'Raccourci : Ctrl+Entrée (⌘+Entrée sur Mac)',

  howTitle: 'Comment ça marche',
  how1Title: 'Écrivez ou collez du Markdown',
  how1Text: 'Titres, tableaux, listes, code, formules, et diagrammes dans des blocs ```mermaid ou ```plantuml. Ou ouvrez un fichier .md.',
  how2Title: 'Converti dans votre navigateur',
  how2Text: 'Pandoc, le convertisseur de documents de référence, tourne dans cette page. Les diagrammes deviennent des objets Word natifs, pas des images.',
  how3Title: 'Modifiez tout dans Word',
  how3Text: 'Cliquez une boîte pour la retaper, déplacez-la et ses flèches suivent, restylez un SmartArt, changez les chiffres d’un graphique avec Modifier les données.',

  elsewhereTitle: 'Aussi là où vous travaillez déjà',
  vscodeTitle: 'Extension VS Code',
  vscodeText: 'Exportez en un clic le Markdown que vous éditez. Aussi sur Open VSX pour VSCodium, Cursor et Windsurf.',
  cliTitle: 'Ligne de commande',
  cliText: 'npx @md2nativedocx/cli rapport.md, avec votre modèle Word, la mise en page, la sortie .pptx et .odt.',
  mcpTitle: 'Serveur MCP',
  mcpText: 'Un assistant IA vous remet un document Word fini, diagrammes modifiables, depuis une conversation.',

  stepsTitle: 'Conversion',
  stepWait: 'En attente du moteur',
  stepWaitDownload: (percent) => `En attente du moteur (téléchargé à ${percent} %)`,
  stepWaitPrepare: 'En attente du moteur (en préparation)',
  stepRead: 'Lecture du Markdown',
  stepDiagrams: (done, total) => (total === undefined ? 'Dessin des diagrammes' : total === 0 ? 'Aucun diagramme dans ce document' : `Dessin des diagrammes (${done} sur ${total})`),
  stepWrite: 'Écriture du document Word',
  stepFinish: 'Ajout des SmartArt et graphiques, vérifications',
  done: (seconds, diagrams) => `Terminé en ${seconds} s${diagrams ? `, ${diagrams} diagramme${diagrams > 1 ? 's' : ''}` : ''}.`,
  download: (name) => `Télécharger ${name}`,
  openInWord: 'Ouvrez-le dans Word : cliquez une boîte pour la retaper, déplacez-la, ses flèches suivent.',
  warningsTitle: (n) => `${n} remarque${n > 1 ? 's' : ''} sur cette conversion`,
  failed: 'La conversion a échoué :',

  footerPandoc: (version) => `Convertisseur : Pandoc ${version} (GPL-2.0-or-later).`,
  footerNotices: 'Licences des bibliothèques incluses',
  footerLicense: 'Licence',
  footerSource: 'Code source',
  footerProject: 'md2nativedocx sur GitHub (domaine public, CC0)',
};

export const MESSAGES = { en, fr };

/** The browser's preferred language among those the page has. */
export function preferredLanguage() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of languages) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (base === 'fr' || base === 'en') return base;
  }
  return 'en';
}
