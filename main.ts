import { App, Plugin, PluginSettingTab, Setting, TFile, Notice, Editor, Modal } from "obsidian";

interface MyPluginSettings {
    minWordLength: number;
    targetFilePath: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    minWordLength: 5,
    targetFilePath: "dictionary.md",
};

export default class ExtractWordsPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        console.log("Lade ExtractWordsPlugin...");
        await this.loadSettings();

        // Befehl für lange Wörter
        this.addCommand({
            id: "extract-long-words",
            name: "Lange Wörter extrahieren",
            callback: async () => {
                console.log("Starte extract-long-words...");
                await this.extractAndAppendWords();
            },
        });

        // Befehl zum alphabetischen Sortieren der dictionary.md
        this.addCommand({
            id: "sort-dictionary",
            name: "Dictionary alphabetisch sortieren",
            callback: async () => {
                console.log("Starte sort-dictionary...");
                await this.sortDictionary();
            },
        });

        // Befehl zum Anhängen eines markierten Wortes
        this.addCommand({
            id: "append-selected-word",
            name: "Markiertes Wort zur Dictionary hinzufügen",
            editorCallback: async (editor: Editor) => {
                console.log("Starte append-selected-word...");
                await this.appendSelectedWord(editor);
            },
        });

        // Befehl zum Entfernen eines Wortes aus der Dictionary
        this.addCommand({
            id: "remove-word-from-dictionary",
            name: "Wort aus Dictionary entfernen",
            callback: async () => {
                console.log("Starte remove-word-from-dictionary...");
                await this.removeWordFromDictionary();
            },
        });

        this.addSettingTab(new ExtractWordsSettingTab(this.app, this));
        console.log("Plugin erfolgreich geladen.");
    }

    async extractAndAppendWords() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice("Keine aktive Datei gefunden.");
            console.warn("Keine aktive Datei gefunden.");
            return;
        }

        const sourceContent = await this.app.vault.read(activeFile);
        console.log("Quelldateiinhalt:", sourceContent);
        const words = this.cleanText(sourceContent);
        const longWords = words.filter(word => word.length >= this.settings.minWordLength);
        const uniqueLongWords = [...new Set(longWords)];

        const dictionaryFile = await this.getOrCreateTargetFile();
        const dictionaryContent = await this.app.vault.read(dictionaryFile);
        const existingWords = new Set(dictionaryContent.split("\n").map(line => line.trim()).filter(line => line !== ""));
        
        const wordsToAppend = uniqueLongWords.filter(word => !existingWords.has(word));
        await this.appendWords(dictionaryFile, dictionaryContent, wordsToAppend);
    }

    async sortDictionary() {
        const dictionaryFile = await this.getOrCreateTargetFile();
        const dictionaryContent = await this.app.vault.read(dictionaryFile);

        // Wörter aus der Datei lesen
        const words = dictionaryContent
            .split("\n")
            .map(word => word.trim())
            .filter(word => word !== "");

        if (words.length === 0) {
            new Notice("Dictionary ist leer.");
            console.log("Dictionary ist leer.");
            return;
        }

        // Alphabetisch sortieren (case-insensitive)
        const sortedWords = [...new Set(words)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        // Aktualisierten Inhalt in die Datei schreiben
        const updatedContent = sortedWords.join("\n");
        await this.app.vault.modify(dictionaryFile, updatedContent);
        new Notice("Dictionary wurde alphabetisch sortiert.");
        console.log("Dictionary alphabetisch sortiert:", sortedWords);
    }

    async appendSelectedWord(editor: Editor) {
        const selectedText = editor.getSelection().trim();
        if (!selectedText) {
            new Notice("Kein Wort markiert.");
            console.warn("Kein Wort markiert.");
            return;
        }

        // Bereinige das markierte Wort
        const cleanedWord = this.cleanText(selectedText)[0]; // Nehme das erste bereinigte Wort
        if (!cleanedWord || cleanedWord.length < this.settings.minWordLength) {
            new Notice("Markiertes Wort ist zu kurz oder ungültig.");
            console.warn("Markiertes Wort ist zu kurz oder ungültig:", selectedText);
            return;
        }

        const dictionaryFile = await this.getOrCreateTargetFile();
        const dictionaryContent = await this.app.vault.read(dictionaryFile);
        const existingWords = new Set(dictionaryContent.split("\n").map(line => line.trim()).filter(line => line !== ""));

        if (existingWords.has(cleanedWord)) {
            new Notice(`${cleanedWord} ist bereits im Dictionary.`);
            console.log(`${cleanedWord} ist bereits im Dictionary.`);
            return;
        }

        // Füge das Wort am Ende der Datei hinzu
        const updatedContent = dictionaryContent ? `${dictionaryContent}\n${cleanedWord}` : cleanedWord;
        await this.app.vault.modify(dictionaryFile, updatedContent);
        new Notice(`${cleanedWord} wurde zum Dictionary hinzugefügt.`);
        console.log(`${cleanedWord} wurde zum Dictionary hinzugefügt.`);
    }

    async removeWordFromDictionary() {
        const wordToRemove = await this.showRemoveWordModal();
        if (!wordToRemove) {
            new Notice("Kein Wort zum Entfernen eingegeben.");
            console.log("Kein Wort zum Entfernen eingegeben.");
            return;
        }

        const dictionaryFile = await this.getOrCreateTargetFile();
        const dictionaryContent = await this.app.vault.read(dictionaryFile);

        // Wörter aus der Datei lesen
        const words = dictionaryContent
            .split("\n")
            .map(word => word.trim())
            .filter(word => word !== "");

        if (words.length === 0) {
            new Notice("Dictionary ist leer.");
            console.log("Dictionary ist leer.");
            return;
        }

        const cleanedWordToRemove = this.cleanText(wordToRemove)[0]; // Bereinige das eingegebene Wort
        if (!cleanedWordToRemove) {
            new Notice("Ungültiges Wort zum Entfernen.");
            console.log("Ungültiges Wort zum Entfernen:", wordToRemove);
            return;
        }

        const existingWords = new Set(words);
        if (!existingWords.has(cleanedWordToRemove)) {
            new Notice(`${cleanedWordToRemove} wurde nicht im Dictionary gefunden.`);
            console.log(`${cleanedWordToRemove} wurde nicht im Dictionary gefunden.`);
            return;
        }

        // Entferne das Wort aus der Liste
        const updatedWords = words.filter(word => word !== cleanedWordToRemove);
        const updatedContent = updatedWords.join("\n");
        await this.app.vault.modify(dictionaryFile, updatedContent);
        new Notice(`${cleanedWordToRemove} wurde aus dem Dictionary entfernt.`);
        console.log(`${cleanedWordToRemove} wurde aus dem Dictionary entfernt.`);
    }

    async showRemoveWordModal(): Promise<string | null> {
        return new Promise((resolve) => {
            class RemoveWordModal extends Modal {
                result: string | null = null;

                constructor(app: App) {
                    super(app);
                }

                onOpen() {
                    const { contentEl } = this;
                    contentEl.createEl("h2", { text: "Wort aus Dictionary entfernen" });
                    contentEl.createEl("p", { text: "Gib das Wort ein, das entfernt werden soll:" });

                    const input = contentEl.createEl("input", { type: "text" });
                    input.addEventListener("keypress", (e: KeyboardEvent) => {
                        if (e.key === "Enter") {
                            this.result = input.value.trim();
                            this.close();
                        }
                    });

                    const button = contentEl.createEl("button", { text: "Entfernen" });
                    button.addEventListener("click", () => {
                        this.result = input.value.trim();
                        this.close();
                    });
                }

                onClose() {
                    const { contentEl } = this;
                    contentEl.empty();
                    resolve(this.result);
                }
            }

            new RemoveWordModal(this.app).open();
        });
    }

    async getOrCreateTargetFile(): Promise<TFile> {
        try {
            let targetFile = this.app.vault.getAbstractFileByPath(this.settings.targetFilePath) as TFile;
            if (!targetFile) {
                console.log(`Erstelle neue Datei: ${this.settings.targetFilePath}`);
                targetFile = await this.app.vault.create(this.settings.targetFilePath, "");
            }
            return targetFile;
        } catch (error) {
            console.error("Fehler beim Erstellen/Holen der Zieldatei:", error);
            new Notice("Fehler beim Zugriff auf die Zieldatei.");
            throw error;
        }
    }

    async appendWords(file: TFile, currentContent: string, words: string[]) {
        if (words.length > 0) {
            const updatedContent = currentContent ? `${currentContent}\n${words.join("\n")}` : words.join("\n");
            await this.app.vault.modify(file, updatedContent);
            new Notice(`Hinzugefügt: ${words.length} Wörter`);
            console.log(`Folgende Wörter wurden hinzugefügt:\n${words.join("\n")}`);
        } else {
            new Notice("Keine neuen Wörter zum Hinzufügen.");
            console.log("Keine neuen Wörter zum Hinzufügen.");
        }
    }

    cleanText(text: string): string[] {
        // Entferne Markdown-Symbole, URLs, und Dateipfade
        const cleaned = text
            .replace(/[*_#>`-]/g, " ") // Markdown-Symbole
            .replace(/\!\[.*?\]\(.*?\)/g, "") // Bilder
            .replace(/\[.*?\]\(.*?\)/g, "") // Links
            .replace(/(https?:\/\/[^\s]+)/g, "") // URLs
            .replace(/\/?[\w\-]+?\.(png|jpg|jpeg|gif|svg|md|txt|pdf)/gi, "") // Dateipfade
            // Entferne alle Satzzeichen und Anführungszeichen
            .replace(/[.,!?;:(){}\[\]<>«»"'`´„“]/g, " ")
            // Teile in Wörter auf und filtere
            .split(/\s+/)
            .map(word => word.trim())
            // Filtere nur Wörter (Buchstaben und optionale Bindestriche)
            .filter(word => /^[a-zA-ZäöüÄÖÜß\-]+$/.test(word) && word !== "");

        console.log("Bereinigte Wörter:", cleaned);
        return cleaned;
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        console.log("Geladene Einstellungen:", this.settings);
    }

    async saveSettings() {
        await this.saveData(this.settings);
        console.log("Gespeicherte Einstellungen:", this.settings);
    }
}

class ExtractWordsSettingTab extends PluginSettingTab {
    plugin: ExtractWordsPlugin;

    constructor(app: App, plugin: ExtractWordsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName("Minimale Wortlänge")
            .setDesc("Mindestlänge für extrahierte Wörter")
            .addText(text => text
                .setPlaceholder("5")
                .setValue(this.plugin.settings.minWordLength.toString())
                .onChange(async (value) => {
                    const parsed = parseInt(value);
                    if (!isNaN(parsed) && parsed > 0) {
                        this.plugin.settings.minWordLength = parsed;
                        await this.plugin.saveSettings();
                    }
                })
            );

        new Setting(containerEl)
            .setName("Ziel-Datei")
            .setDesc("Wähle die .md Datei für die extrahierten Wörter")
            .addText(text => text
                .setPlaceholder("dictionary.md")
                .setValue(this.plugin.settings.targetFilePath)
                .onChange(async (value) => {
                    if (value.endsWith(".md")) {
                        this.plugin.settings.targetFilePath = value;
                        await this.plugin.saveSettings();
                    }
                })
            );
    }
}